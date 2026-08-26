export type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  silent?: boolean;
};

export type JsonSchema = {
  properties?: Record<string, { default?: unknown; [key: string]: unknown }>;
  required?: string[];
  [key: string]: unknown;
};

export type FormData = {
  operation: string;
  [key: string]: unknown;
};
