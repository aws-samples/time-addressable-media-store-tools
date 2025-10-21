// hooks/usePresignedUrl.js
import useSWR from "swr";
import getPresignedUrl from "@/utils/getPresignedUrl";
import { AWS_HLS_OBJECT_LAMBDA_ACCESS_POINT_ARN } from "@/constants";

const fetcher = ({ bucket, key, expiry }) =>
  getPresignedUrl({ bucket, key, expiry });

export const usePresignedUrl = (type, id) => {
  const { data, error, isLoading } = useSWR(
    type && id
      ? {
          bucket: AWS_HLS_OBJECT_LAMBDA_ACCESS_POINT_ARN,
          key: `${type}/${id}/manifest.m3u8`,
          expiry: 3600,
        }
      : null,
    fetcher
  );

  return {
    url: data,
    isLoading,
    error,
  };
};
