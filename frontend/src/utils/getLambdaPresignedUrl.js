import { AwsV4Signer } from "aws4fetch";
import { AWS_REGION } from "@/constants";

const getLambdaPresignedUrl = async ({ functionUrl, path, credentials }) => {
  const resolvedCredentials = await credentials();
  const url = new URL(path, functionUrl);

  const signer = new AwsV4Signer({
    url: url.toString(),
    method: "GET",
    accessKeyId: resolvedCredentials.accessKeyId,
    secretAccessKey: resolvedCredentials.secretAccessKey,
    sessionToken: resolvedCredentials.sessionToken,
    region: AWS_REGION,
    service: "lambda",
    signQuery: true,
  });

  const { url: signedUrl } = await signer.sign();
  return signedUrl.toString();
};

export default getLambdaPresignedUrl;
