/************* ENVIRONMENT VARIABLES **************/
export const APP_TITLE = import.meta.env.VITE_APP_TITLE;
export const APP_TITLE_LOGO = import.meta.env.VITE_APP_TITLE_LOGO;
export const AWS_REGION = import.meta.env.VITE_APP_AWS_REGION;
export const AWS_USER_POOL_ID = import.meta.env.VITE_APP_AWS_USER_POOL_ID;
export const AWS_USER_POOL_CLIENT_WEB_ID = import.meta.env.VITE_APP_AWS_USER_POOL_CLIENT_WEB_ID;
export const AWS_IDENTITY_POOL_ID = import.meta.env.VITE_APP_AWS_IDENTITY_POOL_ID;
export const AWS_TAMS_ENDPOINT = import.meta.env.VITE_APP_AWS_API_ENDPOINT;
export const AWS_INGEST_CREATE_NEW_FLOW_ARN = import.meta.env.VITE_APP_AWS_INGEST_CREATE_NEW_FLOW_ARN;
export const AWS_HLS_OBJECT_LAMBDA_ACCESS_POINT_ARN = import.meta.env.VITE_APP_AWS_HLS_OBJECT_LAMBDA_ACCESS_POINT_ARN
export const AWS_HLS_INGEST_ENDPOINT = import.meta.env.VITE_APP_AWS_HLS_INGEST_ENDPOINT;
export const AWS_HLS_INGEST_ARN = import.meta.env.VITE_APP_AWS_HLS_INGEST_ARN;
export const AWS_FFMPEG_ENDPOINT = import.meta.env.VITE_APP_AWS_FFMPEG_ENDPOINT;
export const AWS_FFMPEG_COMMANDS_PARAMETER = import.meta.env.VITE_APP_AWS_FFMPEG_COMMANDS_PARAMETER;
export const AWS_FFMPEG_BATCH_ARN = import.meta.env.VITE_APP_AWS_FFMPEG_BATCH_ARN;
export const AWS_FFMPEG_EXPORT_ARN = import.meta.env.VITE_APP_AWS_FFMPEG_EXPORT_ARN;
export const AWS_REPLICATION_CONNECTIONS_PARAMETER = import.meta.env.VITE_APP_AWS_REPLICATION_CONNECTIONS_PARAMETER;
export const AWS_REPLICATION_BATCH_ARN = import.meta.env.VITE_APP_AWS_REPLICATION_BATCH_ARN;
export const AWS_REPLICATION_CREATE_RULE_ARN = import.meta.env.VITE_APP_AWS_REPLICATION_CREATE_RULE_ARN;
export const AWS_REPLICATION_DELETE_RULE_ARN = import.meta.env.VITE_APP_AWS_REPLICATION_DELETE_RULE_ARN;
export const OMAKASE_EXPORT_EVENT_BUS = import.meta.env.VITE_APP_OMAKASE_EXPORT_EVENT_BUS;
export const TAMS_AUTH_CONNECTION_ARN = import.meta.env.VITE_APP_TAMS_AUTH_CONNECTION_ARN;
export const MEDIACONVERT_ROLE_ARN = import.meta.env.VITE_APP_AWS_MEDIACONVERT_ROLE_ARN;
export const MEDIACONVERT_BUCKET = import.meta.env.VITE_APP_AWS_MEDIACONVERT_BUCKET;
export const OMAKASE_EXPORT_EVENT_PARAMETER = import.meta.env.VITE_APP_OMAKASE_EXPORT_EVENT_PARAMETER
/************* END OF ENVIRONMENT VARIABLES **************/
export const PAGE_SIZE = 20;
export const PAGE_SIZE_PREFERENCE = {
  title: "Select page size",
  options: [
    { value: 10, label: "10 resources" },
    { value: 20, label: "20 resources" },
    { value: 50, label: "50 resources" },
    { value: 100, label: "100 resources" },
  ],
};
export const TAMS_PAGE_LIMIT = 300;
export const SEGMENT_COUNT = 30;
export const STATUS_MAPPINGS = {
  ABORTED: "warning",
  CANCELED: "warning",
  COMPLETE: "success",
  CREATE_FAILED: "error",
  CREATING: "loading",
  DELETED: "stopped",
  DELETING: "loading",
  ERROR: "error",
  FAILED: "error",
  IDLE: "info",
  PENDING_REDRIVE: "error",
  PROGRESSING: "loading",
  RECOVERING: "loading",
  RUNNING: "loading",
  STARTING: "loading",
  STOPPING: "loading",
  SUBMITTED: "info",
  SUCCEEDED: "success",
  TIMED_OUT: "error",
  UPDATE_FAILED: "error",
  UPDATING: "loading",
};
export const DATE_FORMAT = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
};
