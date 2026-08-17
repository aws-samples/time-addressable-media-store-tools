import { useCallback } from "react";
import { useAuth } from "react-oidc-context";
import { getAwsCredentials } from "@/utils/getAwsCredentials";
import { AWS_REGION } from "@/constants";

import { S3Client } from "@aws-sdk/client-s3";

export const useS3Api = () => {
  const auth = useAuth();

  const getS3Client = useCallback(async () => {
    const idToken = auth.user?.id_token;

    if (!idToken) {
      throw new Error("No ID token available.");
    }

    const credentials = await getAwsCredentials(idToken)();

    console.debug("Obtained AWS credentials for S3 client.");

    return new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
    });
  }, [auth.user]);

  return { getS3Client };
};

export default useS3Api;
