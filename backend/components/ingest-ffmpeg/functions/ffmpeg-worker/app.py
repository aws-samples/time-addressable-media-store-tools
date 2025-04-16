import concurrent.futures
import json
import math
import os
import re
import subprocess  # nosec B404 - subprocess call is safe as command input is controlled
import uuid

import boto3
from aws_lambda_powertools import Logger, Metrics, Tracer
from aws_lambda_powertools.utilities.batch import (
    BatchProcessor,
    EventType,
    process_partial_response,
)
from aws_lambda_powertools.utilities.data_classes.sqs_event import SQSRecord
from aws_lambda_powertools.utilities.typing import LambdaContext
from botocore.config import Config
from botocore.exceptions import ClientError

tracer = Tracer()
logger = Logger()
metrics = Metrics(namespace="Powertools")
batch_processor = BatchProcessor(event_type=EventType.SQS)

s3 = boto3.client("s3")
sqs = boto3.client("sqs")
INGEST_QUEUE_URL = os.environ["INGEST_QUEUE_URL"]
FFMPEG_BUCKET = os.environ["FFMPEG_BUCKET"]


@tracer.capture_method(capture_response=False)
def get_s3_bucket_from_url(get_urls):
    unsigned_urls = [
        get_url["url"] for get_url in get_urls if ":s3:" in get_url["label"]
    ]
    if not unsigned_urls:
        raise ValueError("Could not find unsigned S3 url")
    match = re.match(r"https:\/\/(?P<bucket>.*)\.s3.*", unsigned_urls[0])
    if not match:
        raise ValueError("Could not find bucket in unsigned S3 url")
    return match.group("bucket")


@tracer.capture_method(capture_response=False)
def send_ingest_message(message_body):
    sqs.send_message(
        QueueUrl=INGEST_QUEUE_URL,
        MessageBody=json.dumps(message_body),
    )


@tracer.capture_method(capture_response=False)
def get_signed_url(bucket, obj, expires_in=60):
    s3_cli = boto3.client(
        "s3",
        region_name=os.environ["AWS_REGION"],
        config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
    )
    presigned_url = s3_cli.generate_presigned_url(
        "get_object", Params={"Bucket": bucket, "Key": obj}, ExpiresIn=expires_in
    )
    return presigned_url


@tracer.capture_method(capture_response=False)
def s3_upload(data, bucket, prefix):
    part_size = 50_000_000  # 50MB chunks
    key = f"{prefix}{str(uuid.uuid4())}"
    if len(data) < part_size:
        logger.info(
            "Upload smaller than threshold so performing upload in one chunk..."
        )
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=data,
        )
    else:
        try:
            logger.info("Upload larger than threshold so using multi-part upload...")
            # Initiate multipart upload
            mpu = s3.create_multipart_upload(Bucket=bucket, Key=key)
            # Copy parts
            parts = []
            for part_number in range(math.ceil(len(data) / part_size)):
                # Calculate byte range for this part
                start_byte = part_number * part_size
                end_byte = min(start_byte + part_size - 1, len(data) - 1)
                logger.info(f"Uploading part {part_number + 1}...")
                part = s3.upload_part(
                    Bucket=bucket,
                    Key=key,
                    Body=data[start_byte:end_byte],
                    PartNumber=part_number + 1,
                    UploadId=mpu["UploadId"],
                )
                parts.append({"PartNumber": part_number + 1, "ETag": part["ETag"]})
            # Complete multipart upload
            logger.info("Completing multi part upload...")
            s3.complete_multipart_upload(
                Bucket=bucket,
                Key=key,
                UploadId=mpu["UploadId"],
                MultipartUpload={"Parts": parts},
            )
        except Exception as ex:
            if "mpu" in locals():
                try:
                    s3.abort_multipart_upload(
                        Bucket=bucket,
                        Key=key,
                        UploadId=mpu["UploadId"],
                    )
                except ClientError as err:
                    logger.error(f"Error aborting multipart upload: {err}")
            logger.error(f"Error copying file: {ex}")
            raise
    return key


@tracer.capture_method(capture_response=False)
def execute_ffmpeg_memory(input_bytes, ffmpeg_command):
    args_list = [
        "/opt/bin/ffmpeg",
        "-hide_banner",
        "-i",
        "pipe:0",
        *[a for k, v in ffmpeg_command.items() for a in [k, v] if a],
        "pipe:1",
    ]
    logger.info(" ".join(args_list))
    p = subprocess.Popen(
        args_list,
        shell=False,  # nosec B603 - subprocess call is safe as command input is controlled
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
    )
    stdout, _ = p.communicate(input=input_bytes)
    if p.returncode != 0:
        raise subprocess.CalledProcessError(returncode=p.returncode, cmd=ffmpeg_command)
    else:
        return stdout


@tracer.capture_method(capture_response=False)
def execute_ffmpeg_file(input_list, ffmpeg_command, output_path):
    args_list = [
        "/opt/bin/ffmpeg",
        "-hide_banner",
        *input_list,
        *[a for k, v in ffmpeg_command.items() for a in [k, v] if a],
        output_path,
        "-y",
    ]
    logger.info(" ".join(args_list))
    subprocess.run(
        args_list,
        check=True,
        shell=False,  # nosec B603 - subprocess call is safe as command input is controlled
    )


@tracer.capture_method(capture_response=False)
def download_object(obj):
    bucket = obj["bucket"]
    key = obj["key"]
    download_path = f'/tmp/{key.rsplit("/", 1)[-1]}'  # nosec B108 - /tmp folder used for ephemeral storage
    logger.info(f"Downloading s3://{bucket}/{key}...")
    with open(download_path, "wb") as data:
        s3.download_fileobj(bucket, key, data)
    return download_path


@tracer.capture_method(capture_response=False)
def download_objects_parallel(s3_objects):
    futures = []
    with concurrent.futures.ThreadPoolExecutor() as executor:
        for s3_object in s3_objects:
            futures.append(executor.submit(download_object, s3_object))
    return [future.result() for future in futures]


@tracer.capture_method(capture_response=False)
def process_message(message):
    for segment in message.get("segments", []):
        logger.info(f'Processing Object Id: {segment["object_id"]}...')
        get_segment = s3.get_object(
            Bucket=get_s3_bucket_from_url(segment["get_urls"]), Key=segment["object_id"]
        )
        output = execute_ffmpeg_memory(
            get_segment["Body"].read(),
            message["ffmpeg"]["command"],
        )
        logger.info("Uploading output to S3...")
        key = s3_upload(output, message["outputBucket"], message["outputPrefix"])
        logger.info(
            f'Processing complete, Timerange: {segment["timerange"]}, FlowId: {message["outputFlow"]}...'
        )
        logger.info(f"Sending SQS message to {INGEST_QUEUE_URL}...")
        send_ingest_message(
            {
                "flowId": message["outputFlow"],
                "timerange": segment["timerange"],
                "uri": f's3://{message["outputBucket"]}/{key}',
                "deleteSource": True,
            }
        )


@tracer.capture_method(capture_response=False)
def concat_action(message):
    logger.info("Downloading segments to /tmp...")
    download_paths = download_objects_parallel(message["s3Objects"])
    logger.info("Executing FFmpeg concat...")
    execute_ffmpeg_file(
        ["-i", f'concat:{"|".join(download_paths)}'],
        message["ffmpeg"]["command"],
        "/tmp/ffmpegOutput",  # nosec B108 - /tmp folder used for ephemeral storage
    )
    logger.info("Deleting downloaded segments...")
    for tmp_path in download_paths:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    logger.info("Uploading output to S3...")
    with open(
        "/tmp/ffmpegOutput", mode="rb"
    ) as file:  # nosec B108 - /tmp folder used for ephemeral storage
        fileContent = file.read()
    output_key = s3_upload(fileContent, message["outputBucket"], "concat/")
    logger.info("Deleting ffmpeg output...")
    if os.path.exists(
        "/tmp/ffmpegOutput"
    ):  # nosec B108 - /tmp folder used for ephemeral storage
        os.remove(
            "/tmp/ffmpegOutput"
        )  # nosec B108 - /tmp folder used for ephemeral storage
    return {"s3Object": {"bucket": message["outputBucket"], "key": output_key}}


@tracer.capture_method(capture_response=False)
def merge_action(message):
    logger.info("Downloading concat files to /tmp...")
    download_paths = download_objects_parallel(message["s3Objects"])
    logger.info("Executing FFmpeg merge...")
    execute_ffmpeg_file(
        [a for dp in download_paths for a in ["-i", dp]],
        message["ffmpeg"]["command"],
        "/tmp/ffmpegOutput",  # nosec B108 - /tmp folder used for ephemeral storage
    )
    logger.info("Deleting downloaded concat files...")
    for tmp_path in download_paths:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    logger.info("Deleting S3 concat files...")
    s3.delete_objects(
        Bucket=message["s3Objects"][0]["bucket"],
        Delete={
            "Objects": [{"Key": s3_object["key"]} for s3_object in message["s3Objects"]]
        },
    )
    logger.info("Uploading output to S3...")
    with open(
        "/tmp/ffmpegOutput", mode="rb"
    ) as file:  # nosec B108 - /tmp folder used for ephemeral storage
        fileContent = file.read()
    output_key = s3_upload(fileContent, message["outputBucket"], "export/")
    logger.info("Deleting ffmpeg output...")
    if os.path.exists(
        "/tmp/ffmpegOutput"
    ):  # nosec B108 - /tmp folder used for ephemeral storage
        os.remove(
            "/tmp/ffmpegOutput"
        )  # nosec B108 - /tmp folder used for ephemeral storage
    return {"s3Object": {"bucket": message["outputBucket"], "key": output_key}}


@tracer.capture_method(capture_response=False)
def record_handler(record: SQSRecord) -> None:
    """Processes a single SQS record"""
    message = json.loads(record.body)
    process_message(message)


@logger.inject_lambda_context(log_event=True)
@tracer.capture_lambda_handler(capture_response=False)
@metrics.log_metrics(capture_cold_start_metric=True)
# pylint: disable=unused-argument
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    if "Records" in event:
        return process_partial_response(
            event=event,
            record_handler=record_handler,
            processor=batch_processor,
            context=context,
        )
    elif "action" in event:
        match event["action"]:
            case "CONCAT":
                return concat_action(event)
            case "MERGE":
                return merge_action(event)
