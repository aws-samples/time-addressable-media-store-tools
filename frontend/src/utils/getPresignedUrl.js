import { AWS_REGION } from "@/constants";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { fetchAuthSession } from "aws-amplify/auth";

const getPresignedUrl = ({ bucket, key, expiry, ...rest }) =>
  fetchAuthSession().then((session) => {
    const s3Client = new S3Client({
      region: AWS_REGION,
      credentials: session.credentials,
    });
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...rest,
    });
    return getSignedUrl(s3Client, command, { expiresIn: expiry });
  });

export default getPresignedUrl;
