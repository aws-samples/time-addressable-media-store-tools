import useSWR from "swr";
import getLambdaPresignedUrl from "@/utils/getLambdaPresignedUrl";
import { AWS_HLS_FUNCTION_URL } from "@/constants";
import useAwsCredentials from "@/hooks/useAwsCredentials";

export const useLambdaPresignedUrl = (type, id) => {
  const credentials = useAwsCredentials();
  const { data, error, isLoading } = useSWR(
    type && id
      ? {
          functionUrl: AWS_HLS_FUNCTION_URL,
          path: `${type}/${id}/manifest.m3u8`,
          credentials,
        }
      : null,
    getLambdaPresignedUrl,
  );

  return {
    url: data,
    isLoading,
    error,
  };
};
