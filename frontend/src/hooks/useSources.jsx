import { useApi } from "@/hooks/useApi";
import useSWR from "swr";
import paginationFetcher from "@/utils/paginationFetcher";

export const useSources = () => {
  const { data, mutate, error, isLoading, isValidating } = useSWR(
    "/sources?limit=300",
    paginationFetcher,
    {
      refreshInterval: 3000,
    }
  );

  return {
    sources: data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export const useSource = (sourceId) => {
  const { get } = useApi();
  const {
    data: response,
    mutate,
    error,
    isLoading,
    isValidating,
  } = useSWR(
    ["/sources", sourceId],
    ([path, sourceId]) => get(`${path}/${sourceId}`),
    {
      refreshInterval: 3000,
    }
  );

  return {
    source: response?.data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export const useSourceFlows = (sourceId) => {
  const { get } = useApi();
  const {
    data: response,
    mutate,
    error,
    isLoading,
    isValidating,
  } = useSWR(
    ["/flows", sourceId],
    ([path, sourceId]) => get(`${path}?source_id=${sourceId}`),
    {
      refreshInterval: 3000,
    }
  );

  return {
    flows: response?.data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};
