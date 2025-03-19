import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import ffmpeg from "fluent-ffmpeg";
import { path as ffmpegPath } from "@ffmpeg-installer/ffmpeg";
import { PassThrough } from "stream";

const REGION = process.env.AWS_REGION;
const INGEST_QUEUE_URL = process.env.INGEST_QUEUE_URL;

const s3Client = new S3Client({ region: REGION });
const sqsClient = new SQSClient({ region: REGION });
ffmpeg.setFfmpegPath(ffmpegPath);

const getS3BucketFromUrl = (getUrls) => {
  const bucketMatch = getUrls
    .find((getUrl) => getUrl.label.includes(":s3:"))
    ?.url.match(/https:\/\/(?<bucket>.*)\.s3.*/);
  if (!bucketMatch?.groups) {
    throw new Error("Could not find bucket in get_urls");
  }
  return bucketMatch.groups.bucket;
};

const createS3UploadStream = (outputBucket, outputPrefix) => {
  const outputStream = new PassThrough();
  const outputKey = `${outputPrefix}${crypto.randomUUID()}`;
  console.info(
    `Preparing S3 destination: s3://${outputBucket}/${outputKey}...`
  );
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: outputBucket,
      Key: outputKey,
      Body: outputStream,
    },
  });
  upload.on("httpUploadProgress", (progress) => {
    console.info("httpUploadProgress", progress);
  });
  return { outputStream, upload, outputKey };
};

const getS3FileStream = async (segment) => {
  const bucket = getS3BucketFromUrl(segment.get_urls);
  const getObjectCommandResponse = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: segment.object_id,
    })
  );
  if (!getObjectCommandResponse.Body) {
    throw new Error(
      `Could not get object from S3: ${bucket}/${segment.object_id}`
    );
  }
  return getObjectCommandResponse.Body;
};

const executeFFmpegCommandSingle = (
  inputStream,
  ffmpegConfig,
  outputStream
) => {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(inputStream)
      .outputOptions(ffmpegConfig.command)
      .outputFormat(ffmpegConfig.outputFormat)
      .on("start", (commandLine) => {
        console.info("FFmpeg command:", commandLine);
      })
      .on("progress", (progress) => {
        console.log("Processing:", progress.percent, "% done");
      })
      .on("error", (err, stdout, stderr) => {
        console.error("FFmpeg error:", err);
        console.error("FFmpeg stdout:", stdout);
        console.error("FFmpeg stderr:", stderr);
        reject(err);
      })
      .on("end", () => {
        console.info("FFmpeg processing finished");
        resolve();
      })
      .pipe(outputStream, { end: true });
  });
};

const sendIngestMessage = async (messageBody) => {
  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: INGEST_QUEUE_URL,
      MessageBody: JSON.stringify(messageBody),
    })
  );
};

const processMessage = async (message) => {
  if (message.segments) {
    for (const segment of message.segments) {
      console.info(`Processing Object Id: ${segment.object_id}...`);
      const { outputStream, upload, outputKey } = createS3UploadStream(
        message.outputBucket,
        message.outputPrefix
      );
      const input = await getS3FileStream(segment);
      await executeFFmpegCommandSingle(input, message.ffmpeg, outputStream);
      console.info("Uploading output to S3...");
      await upload.done();
      console.info(
        `Processing complete, Timerange: ${segment.timerange}, FlowId: ${message.destinationFlow}...`
      );
      console.info(`Sending SQS message to ${INGEST_QUEUE_URL}...`);
      await sendIngestMessage({
        flowId: message.destinationFlow,
        timerange: segment.timerange,
        uri: `s3://${message.outputBucket}/${outputKey}`,
        deleteSource: true,
      });
    }
  }
};

export const lambdaHandler = async (event, _context) => {
  console.info(JSON.stringify(event));
  for (const message of event.Records) {
    await processMessage(JSON.parse(message.body));
  }
};
