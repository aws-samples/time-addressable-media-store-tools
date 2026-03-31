import type { DateTime } from "luxon";
import type { CognitoIdentityCredentialProvider } from "@aws-sdk/credential-providers";

export type ApiClient = {
  get: <T = any>(path: string) => Promise<{ data: T; nextLink?: string }>;
};

export type GetPresignedUrlParams = {
  bucket: string;
  key: string;
  expiry: number;
  credentials: CognitoIdentityCredentialProvider;
  [key: string]: any;
};

export type TimerangeDateTimeResult = {
  includesStart: boolean;
  start: DateTime | undefined;
  end: DateTime | undefined;
  includesEnd: boolean;
};
