import useSWR from "swr";
import { getLambdaSignedUrl } from "@/utils/getLambdaSignedUrl";
import { AWS_HLS_FUNCTION_URL } from "@/constants";
import useAwsCredentials from "@/hooks/useAwsCredentials";

export const usePresignedUrl = (type, id) => {
  const credentials = useAwsCredentials();
  const { data, error, isLoading } = useSWR(
    type && id
      ? {
          functionUrl: AWS_HLS_FUNCTION_URL,
          path: `/${type}/${id}/manifest.m3u8`,
          expiresIn: 3600,
          credentials,
        }
      : null,
    getLambdaSignedUrl
  );

  return {
    url: data,
    isLoading,
    error,
  };
};
