/**
 * Python models: backend/components/ingest-ffmpeg/functions/api-ffmpeg-ingestion/schemas.py
 * Keep these in sync manually.
 */

import type { Uuid } from "@/types/tams";
import type { ExecutionStatus } from "@aws-sdk/client-sfn";

export type FfmpegConfig = {
  command: Record<string, string | null>;
  tams?: Record<string, unknown>;
};

export type RuleTarget = {
  outputFlow: Uuid;
  ffmpeg: FfmpegConfig;
  executionArn?: string;
};

export type JobTarget = {
  outputFlow: Uuid;
  ffmpeg: FfmpegConfig;
  executionArn: string;
  status: ExecutionStatus;
  startDate: string;
  stopDate: string;
  sourceTimerange: string;
};

export type FfmpegRule = {
  id: Uuid;
  targets: RuleTarget[];
};

export type FfmpegJob = {
  id: Uuid;
  targets: JobTarget[];
};

export type S3ObjectOutput = {
  bucket?: string;
  key?: string;
  [key: string]: unknown;
};

export type FfmpegExport = {
  executionArn: string;
  status: ExecutionStatus;
  startDate: string;
  stopDate: string;
  timerange: string;
  flowIds: Uuid[];
  ffmpeg: FfmpegConfig;
  output: S3ObjectOutput;
};
