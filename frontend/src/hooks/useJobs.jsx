import useIamApi from "@/hooks/useIamApi";
import { AWS_HLS_INGEST_ENDPOINT } from "@/constants";
import useSWR from "swr";

const useJobs = () => {
  const api = useIamApi(AWS_HLS_INGEST_ENDPOINT);
  const { data, mutate, error, isLoading, isValidating } = useSWR(
    "/job-ingestion",
    (path) => api.get(path),
    {
      refreshInterval: 3000,
    }
  );

  return {
    jobs: data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export default useJobs;
