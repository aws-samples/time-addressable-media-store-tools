import { useApi } from "@/hooks/useApi";
import useSWR from "swr";
import paginationFetcher from "@/utils/paginationFetcher";
import { TAMS_PAGE_LIMIT, TAMS_POLLING_INTERVAL } from "@/constants";
import type { Uuid, Source, Flow } from "@/types/tams";

export const useSources = () => {
  const api = useApi();
  const { data, mutate, error, isLoading, isValidating } = useSWR<Source[]>(
    `/sources?limit=${TAMS_PAGE_LIMIT}`,
    (path) => paginationFetcher(path, api),
    {
      refreshInterval: TAMS_POLLING_INTERVAL,
    },
  );

  return {
    sources: data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export const useSource = (sourceId: Uuid) => {
  const { get } = useApi();
  const {
    data: response,
    mutate,
    error,
    isLoading,
    isValidating,
  } = useSWR<{
    data: Source;
    headers: Record<string, string>;
    nextLink?: string;
  }>(["/sources", sourceId], ([path, sourceId]) => get(`${path}/${sourceId}`), {
    refreshInterval: TAMS_POLLING_INTERVAL,
  });

  return {
    source: response?.data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export const useSourceFlows = (sourceId: Uuid) => {
  const { get } = useApi();
  const {
    data: response,
    mutate,
    error,
    isLoading,
    isValidating,
  } = useSWR<{
    data: Flow[];
    headers: Record<string, string>;
    nextLink?: string;
  }>(
    ["/flows", sourceId],
    ([path, sourceId]) => get(`${path}?source_id=${sourceId}`),
    {
      refreshInterval: TAMS_POLLING_INTERVAL,
    },
  );

  return {
    flows: response?.data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};
