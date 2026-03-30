export type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
};

export type JsonSchema = {
  properties?: Record<string, { default?: any; [key: string]: any }>;
  required?: string[];
  [key: string]: any;
};

export type FormData = {
  operation: string;
  [key: string]: any;
};
