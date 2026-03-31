import { useAuth } from "react-oidc-context";
import { AwsClient } from "aws4fetch";
import { getAwsCredentials } from "@/utils/getAwsCredentials";
import { AWS_REGION } from "@/constants";
import type { RequestOptions } from "@/types/hooks";

export const useIamApi = (endpoint: string) => {
  const auth = useAuth();
  const idToken = auth.user?.id_token;

  const makeRequest = async (path: string, options: RequestOptions = {}) => {
    if (!idToken) {
      throw new Error("No ID token available");
    }
    const credentials = await getAwsCredentials(idToken)();

    const aws = new AwsClient({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      region: AWS_REGION,
    });

    const response = await aws.fetch(`${endpoint}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    return response.json().catch(() => ({}));
  };

  return {
    get: (path: string, options: RequestOptions = {}) =>
      makeRequest(path, { ...options, method: "GET" }),
    post: (path: string, body: any, options: RequestOptions = {}) =>
      makeRequest(path, { ...options, method: "POST", body }),
    put: (path: string, body: any, options: RequestOptions = {}) =>
      makeRequest(path, { ...options, method: "PUT", body }),
    del: (path: string, options: RequestOptions = {}) =>
      makeRequest(path, { ...options, method: "DELETE" }),
  };
};

export default useIamApi;
