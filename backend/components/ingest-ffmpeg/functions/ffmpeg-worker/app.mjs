import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import ffmpeg from "fluent-ffmpeg";
import { path as ffmpegPath } from "@ffmpeg-installer/ffmpeg";
import { PassThrough } from "stream";
import { createWriteStream, createReadStream } from "fs";
import { unlink } from "fs/promises";

const REGION = process.env.AWS_REGION;
const INGEST_QUEUE_URL = process.env.INGEST_QUEUE_URL;
const FFMPEG_BUCKET = process.env.FFMPEG_BUCKET;

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

const getSegmentStream = (segment) => {
  const bucket = getS3BucketFromUrl(segment.get_urls);
  return getObjectStream({ bucket, key: segment.object_id });
};

const getObjectStream = async ({ bucket, key }) => {
  const getObjectCommandResponse = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
  if (!getObjectCommandResponse.Body) {
    throw new Error(`Could not get object from S3: s3://${bucket}/${key}`);
  }
  return getObjectCommandResponse.Body;
};

const executeFFmpegToStream = (inputStream, ffmpegConfig, outputStream) => {
  return new Promise((resolve, reject) => {
    const stream = ffmpeg()
      .input(inputStream)
      .outputOptions(ffmpegConfig.command)
      .outputFormat(ffmpegConfig.outputFormat)
      .on("start", (commandLine) => {
        console.info("FFmpeg command:", commandLine);
      })
      .on("progress", (progress) => {
        console.log("Processing:", progress);
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
      });
    outputStream.on("error", (err) => {
      reject(err);
    });
    outputStream.on("finish", () => {
      console.info("Pass through stream finished");
      resolve();
    });
    outputStream.on("close", () => {
      console.info("PassThrough stream closed");
      resolve();
    });
    stream.pipe(outputStream, { end: true });
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

const downloadObject = async (obj) => {
  const readStream = await getObjectStream(obj);
  const downloadPath = `/tmp/${obj.key.split("/").reverse()[0]}`;
  const writeStream = createWriteStream(downloadPath);
  // Write the stream to file
  await new Promise((resolve, reject) => {
    readStream
      .pipe(writeStream)
      .on("error", (err) => reject(err))
      .on("finish", () => resolve());
  });
  console.info(`File downloaded successfully to ${downloadPath}`);
  return downloadPath;
};

const s3Upload = async (bucket, prefix, tmpPath) => {
  const inputStream = createReadStream(tmpPath);
  const key = `${prefix}${crypto.randomUUID()}`;
  console.info(`Preparing S3 destination: s3://${bucket}/${key}...`);
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: inputStream,
    },
  });
  upload.on("httpUploadProgress", (progress) => {
    console.info("httpUploadProgress", progress);
  });
  await upload.done();
  return key;
};

const processMessage = async (message) => {
  if (message.segments) {
    for (const segment of message.segments) {
      console.info(`Processing Object Id: ${segment.object_id}...`);
      const { outputStream, upload, outputKey } = createS3UploadStream(
        message.outputBucket,
        message.outputPrefix
      );
      const input = await getSegmentStream(segment);
      console.info("Uploading output to S3...");
      const uploadPromise = upload.done();
      await executeFFmpegToStream(input, message.ffmpeg, outputStream);
      await uploadPromise;
      console.info(
        `Processing complete, Timerange: ${segment.timerange}, FlowId: ${message.outputFlow}...`
      );
      console.info(`Sending SQS message to ${INGEST_QUEUE_URL}...`);
      await sendIngestMessage({
        flowId: message.outputFlow,
        timerange: segment.timerange,
        uri: `s3://${message.outputBucket}/${outputKey}`,
        deleteSource: true,
      });
    }
  }
};

const concatAction = async (message) => {
  // Download segments to /tmp folder
  const downloadPromises = message.s3Objects.map((s3Object) =>
    downloadObject(s3Object)
  );
  const inputs = await Promise.all(downloadPromises);
  // Execute the ffmpeg concat job
  const ffmpegPromise = new Promise((resolve, reject) => {
    ffmpeg(`concat:${inputs.join("|")}`)
      .outputOptions(message.ffmpeg.command)
      .outputFormat(message.ffmpeg.outputFormat)
      .on("start", (commandLine) => {
        console.info("FFmpeg command:", commandLine);
      })
      .on("progress", (progress) => {
        console.log("Processing:", progress);
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
      .save("/tmp/ffmpegOutput");
  });
  await ffmpegPromise;
  // Delete /tmp segments
  await Promise.all(inputs.map((filePath) => unlink(filePath)));
  // Upload concat output
  const outputKey = await s3Upload(
    message.outputBucket,
    "concat/",
    "/tmp/ffmpegOutput"
  );
  // Delete /tmp concat output
  await unlink("/tmp/ffmpegOutput");
  return { s3Object: { bucket: message.outputBucket, key: outputKey } };
};

const mergeAction = async (message) => {
  // Download concat files to /tmp folder
  const downloadPromises = message.s3Objects.map((s3Object) =>
    downloadObject(s3Object)
  );
  const inputs = await Promise.all(downloadPromises);
  // Execute the ffmpeg merge job
  const ffmpegPromise = new Promise((resolve, reject) => {
    let command = ffmpeg();
    inputs.forEach((input) => {
      command = command.input(input);
    });
    command
      .outputOptions(message.ffmpeg.command)
      .outputFormat(message.ffmpeg.outputFormat)
      .on("start", (commandLine) => {
        console.info("FFmpeg command:", commandLine);
      })
      .on("progress", (progress) => {
        console.log("Processing:", progress);
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
      .save("/tmp/ffmpegOutput");
  });
  await ffmpegPromise;
  // Delete /tmp concat files
  await Promise.all(inputs.map((filePath) => unlink(filePath)));
  // Delete s3 concat files
  await Promise.all(
    message.s3Objects
      .filter(({ bucket }) => bucket === FFMPEG_BUCKET)
      .map(({ bucket, key }) =>
        s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
      )
  );
  // upload export result
  const outputKey = await s3Upload(
    message.outputBucket,
    "export/",
    "/tmp/ffmpegOutput"
  );
  // delete /tmp export result
  await unlink("/tmp/ffmpegOutput");
  return { s3Object: { bucket: message.outputBucket, key: outputKey } };
};

export const lambdaHandler = async (event, _context) => {
  console.info(JSON.stringify(event));
  if (event.Records) {
    for (const message of event.Records) {
      await processMessage(JSON.parse(message.body));
    }
  }
  if (event.action) {
    if (event.action == "CONCAT") {
      return await concatAction(event);
    }
    if (event.action == "MERGE") {
      return await mergeAction(event);
    }
  }
};
