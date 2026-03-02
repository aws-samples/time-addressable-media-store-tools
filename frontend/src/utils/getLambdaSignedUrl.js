import { SignatureV4 } from "@smithy/signature-v4";
import { HttpRequest } from "@smithy/protocol-http";
import { Sha256 } from "@aws-crypto/sha256-js";
import { AWS_REGION } from "@/constants";

/**
 * Generate a presigned URL for Lambda Function URL with IAM auth
 * @param {string} functionUrl - The base Lambda Function URL
 * @param {string} path - The path to append to the Function URL
 * @param {number} expiresIn - URL expiration time in seconds (default 3600)
 * @param {object} credentials - AWS credentials object for signing the request
 * @returns {Promise<string>} The presigned URL
 */
export async function getLambdaSignedUrl({functionUrl, path, expiresIn = 3600, credentials}) {
  if (!functionUrl || typeof functionUrl !== "string") {
    throw new Error("Invalid function URL");
  }
  if (!path || typeof path !== "string") {
    throw new Error("Invalid path");
  }
  if (expiresIn <= 0 || expiresIn > 43200) {
    throw new Error("expiresIn must be between 1 and 43200 seconds");
  }

  try {
    const url = new URL(path, functionUrl);

    const request = new HttpRequest({
      method: "GET",
      protocol: url.protocol,
      hostname: url.hostname,
      path: url.pathname,
      headers: {
        host: url.hostname,
      },
    });

    const signer = new SignatureV4({
      credentials,
      region: AWS_REGION,
      service: "lambda",
      sha256: Sha256,
    });

    // Use presign() to get URL with query string auth (works with video players)
    const signedRequest = await signer.presign(request, { expiresIn });

    // Reconstruct URL with signed query parameters
    const signedUrl = new URL(
      signedRequest.path,
      `${signedRequest.protocol}//${signedRequest.hostname}`
    );
    for (const [key, value] of Object.entries(signedRequest.query || {})) {
      signedUrl.searchParams.set(key, value);
    }

    return signedUrl.toString();
  } catch (error) {
    console.error("Failed to generate signed URL:", error);
    throw new Error(`URL signing failed: ${error.message}`);
  }
}

export default getLambdaSignedUrl;
