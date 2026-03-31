/**
 * Python models: backend/components/ingest-hls/functions/api-hls-ingestion/schemas.py
 * Keep these in sync manually.
 */

import type { JobStatus } from "@aws-sdk/client-mediaconvert";
import type { ChannelState } from "@aws-sdk/client-medialive";
import type { ExecutionStatus } from "@aws-sdk/client-sfn";

export type JobIngestion = {
  id: string;
  fileName: string;
  manifestUri: string;
  manifestExists: boolean;
  status: JobStatus;
  jobPercentComplete: number | null;
}

export type ChannelIngestion = {
  id: string;
  name: string;
  manifestUri: string | null;
  manifestExists: boolean;
  state: ChannelState;
}

export type Workflow = {
  executionArn: string;
  elementalService: string;
  elementalId: string;
  status: ExecutionStatus;
  startDate: string;
  stopDate: string | null;
}
