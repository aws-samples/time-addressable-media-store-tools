
import {
  SQSClient,
  ReceiveMessageCommand,
  SendMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import ffmpeg from "fluent-ffmpeg";
import { path as ffmpegPath } from "@ffmpeg-installer/ffmpeg";
import { PassThrough } from "stream";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { Agent } from "https";

const REGION = process.env.AWS_REGION;
const INGEST_QUEUE_URL = process.env.INGEST_QUEUE_URL;
const FFMPEG_QUEUE_URL = process.env.FFMPEG_QUEUE_URL;

const s3Client = new S3Client({
  region: REGION,
  requestHandler: new NodeHttpHandler({
    httpsAgent: new Agent({ keepAlive: false }),
  }),
});
const sqsClient = new SQSClient({ region: REGION });
ffmpeg.setFfmpegPath(ffmpegPath);

const processMessage = async (message) => {
  if (message.segments) {
    for (const segment of message.segments) {
      console.info(`Processing Object Id: ${segment.object_id}...`);
      const bucket = segment.get_urls
        .find((getUrl) => getUrl.label.includes(":s3:"))
        .url.match(/https:\/\/(?<bucket>.*)\.s3.*/).groups.bucket;
      const getObjectCommandResponse = await s3Client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: segment.object_id,
        })
      );
      const passThrough = new PassThrough();
      const outputKey = `${message.outputPrefix}${crypto.randomUUID()}`;
      console.info(
        `Preparing S3 destination: s3://${message.outputBucket}/${outputKey}...`
      );
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: message.outputBucket,
          Key: outputKey,
          Body: passThrough,
        },
      });
      ffmpeg()
        .input(getObjectCommandResponse.Body)
        .outputOptions(message.ffmpeg.command)
        .outputFormat(message.ffmpeg.outputFormat)
        .on("start", (commandLine) => {
          console.info("FFmpeg command:", commandLine);
        })
        .on("error", (err, stdout, stderr) => {
          console.error("FFmpeg error:", err);
          console.error("FFmpeg stderr:", stderr);
        })
        .on("end", () => {
          console.info("FFmpeg processing finished");
        })
        .pipe(passThrough, { end: true });
      console.info("Uploading output to S3...");
      await upload.done();
      console.info(
        `Processing complete, Timerange: ${segment.timerange}, FlowId: ${message.destinationFlow}...`
      );
      console.info(`Sending SQS message to ${INGEST_QUEUE_URL}...`);
      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: INGEST_QUEUE_URL,
          MessageBody: JSON.stringify({
            flowId: message.destinationFlow,
            timerange: segment.timerange,
            uri: `s3://${message.outputBucket}/${outputKey}`,
            deleteSource: true,
          }),
        })
      );
    }
  }
};

export const lambdaHandler = async (event, context) => {
  console.info(event);
  for (const message of event.Records) {
    await processMessage(JSON.parse(message.body));
  }
};

export const main = async () => {
  const receiveMessageCommand = new ReceiveMessageCommand({
    QueueUrl: FFMPEG_QUEUE_URL,
    MaxNumberOfMessages: 1,
    WaitTimeSeconds: 10,
  });
  while (true) {
    console.info(`Polling SQS queue: ${FFMPEG_QUEUE_URL}...`);
    const receiveMessageResponse = await sqsClient.send(receiveMessageCommand);
    if (receiveMessageResponse.Messages) {
      for (const message of receiveMessageResponse.Messages) {
        console.info("Message received...");
        await processMessage(JSON.parse(message.Body));
        console.info("Deleting message...");
        await sqsClient.send(
          new DeleteMessageCommand({
            QueueUrl: FFMPEG_QUEUE_URL,
            ReceiptHandle: message.ReceiptHandle,
          })
        );
      }
    }
  }
};

// main().catch((error) => {
//   console.error("Error in main:", error);
//   process.exit(1);
// });
