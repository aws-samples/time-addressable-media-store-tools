import useSWR from "swr";
import getPresignedUrl from "@/utils/getPresignedUrl";
import { AWS_HLS_OBJECT_LAMBDA_ACCESS_POINT_ARN } from "@/constants";
import useAwsCredentials from "@/hooks/useAwsCredentials";

export const usePresignedUrl = (type, id) => {
  const credentials = useAwsCredentials();
  const { data, error, isLoading } = useSWR(
    type && id
      ? {
          bucket: AWS_HLS_OBJECT_LAMBDA_ACCESS_POINT_ARN,
          key: `${type}/${id}/manifest.m3u8`,
          expiry: 3600,
          credentials,
        }
      : null,
    getPresignedUrl
  );

  return {
    url: data,
    isLoading,
    error,
  };
};
