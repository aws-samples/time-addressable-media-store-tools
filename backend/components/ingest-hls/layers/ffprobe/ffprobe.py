import json
import os
import subprocess  # nosec B404 - subprocess call is safe as command input is controlled
from urllib.parse import urlparse

import boto3
from botocore.config import Config


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


def ffprobe_link(source, byterange=None):
    try:
        source_parse = urlparse(source)
        url = (
            get_signed_url(source_parse.netloc, source_parse.path[1:])
            if source_parse.scheme == "s3"
            else source
        )
        args = [
            "/opt/bin/ffprobe",
            "-loglevel",
            "error",
        ]
        # Range header is deliberately unsigned so ffprobe_link can fetch byte ranges without re-signing
        if byterange:
            length_str, offset_str = byterange.split("@")
            offset = int(offset_str)
            end = offset + int(length_str) - 1
            args.extend(["-headers", f"Range: bytes={offset}-{end}\r\n"])
        args.extend(
            [
                "-show_format",
                "-show_streams",
                url,
                "-print_format",
                "json",
            ]
        )
        ffprobe = subprocess.run(
            args,
            check=True,
            shell=False,  # nosec B603 - subprocess call is safe as command input is controlled
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if ffprobe.returncode == 0:
            return json.loads(ffprobe.stdout.decode("utf-8"))
    except subprocess.CalledProcessError as ex:
        print(ex.stderr.decode("utf-8"))
