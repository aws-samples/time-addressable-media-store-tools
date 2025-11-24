import { useAuth } from "react-oidc-context";
import { AwsClient } from "aws4fetch";
import { getAwsCredentials } from "@/utils/getAwsCredentials";
import { AWS_REGION } from "@/constants";

export const useIamApi = (endpoint) => {
  const auth = useAuth();
  const idToken = auth.user?.id_token;

  const makeRequest = async (path, options = {}) => {
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

    return response.json();
  };

  return {
    get: (path, options = {}) =>
      makeRequest(path, { ...options, method: "GET" }),
    post: (path, body, options = {}) =>
      makeRequest(path, { ...options, method: "POST", body }),
    put: (path, body, options = {}) =>
      makeRequest(path, { ...options, method: "PUT", body }),
    del: (path, options = {}) =>
      makeRequest(path, { ...options, method: "DELETE" }),
  };
};

export default useIamApi;
