/************* ENVIRONMENT VARIABLES **************/
export const AWS_REGION = import.meta.env.VITE_APP_AWS_REGION;
export const AWS_USER_POOL_ID = import.meta.env.VITE_APP_AWS_USER_POOL_ID;
export const AWS_USER_POOL_CLIENT_WEB_ID = import.meta.env.VITE_APP_AWS_USER_POOL_CLIENT_WEB_ID;
export const AWS_IDENTITY_POOL_ID = import.meta.env.VITE_APP_AWS_IDENTITY_POOL_ID;
export const AWS_TAMS_ENDPOINT = import.meta.env.VITE_APP_AWS_API_ENDPOINT;
export const AWS_HLS_API_ENDPOINT = import.meta.env.VITE_APP_AWS_HLS_API_ENDPOINT
export const AWS_HLS_INGEST_ENDPOINT = import.meta.env.VITE_APP_AWS_HLS_INGEST_ENDPOINT
export const AWS_HLS_INGEST_ARN = import.meta.env.VITE_APP_AWS_HLS_INGEST_ARN;
export const AWS_ML_ENDPOINT = import.meta.env.VITE_APP_AWS_ML_ENDPOINT
export const AWS_ML_START_ARN = import.meta.env.VITE_APP_AWS_ML_START_ARN;
export const AWS_ML_STOP_ARN = import.meta.env.VITE_APP_AWS_ML_STOP_ARN;
export const AWS_MC_ENDPOINT = import.meta.env.VITE_APP_AWS_MC_ENDPOINT
/************* END OF ENVIRONMENT VARIABLES **************/
export const PAGE_SIZE = 10;
export const TAMS_PAGE_LIMIT = 300;
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
    RUNNING: "success",
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
