import { useApi } from "@/hooks/useApi";
import useSWR from "swr";
import paginationFetcher from "@/utils/paginationFetcher";
import type { Uuid, Timerange, Flow, Segment } from "@/types/tams";

export const useLastN = (flowId: Uuid, n: number) => {
  const api = useApi();
  const { data, mutate, error, isLoading, isValidating } = useSWR<Segment[]>(
    `/flows/${flowId}/segments`,
    (path: string) =>
      paginationFetcher(
        `${path}?accept_get_urls=&reverse_order=true&include_object_timerange=true`,
        api,
        n,
      ),
    {
      refreshInterval: 3000,
    },
  );

  return {
    segments: data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export const useSegments = (
  flowId: Uuid,
  timerange: Timerange,
  maxResults: number = 3000,
) => {
  const api = useApi();
  const { data, mutate, error, isLoading, isValidating } = useSWR<Segment[]>(
    `/flows/${flowId}/segments`,
    (path: string) =>
      paginationFetcher(
        `${path}${
          timerange ? `?timerange=${timerange}` : ""
        }&reverse_order=false&limit=300`,
        api,
        maxResults,
      ),
  );

  return {
    segments: data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export const useFlowsSegments = (
  flows: Flow[],
  timerange: Timerange,
  maxResults: number = 3000,
) => {
  const api = useApi();
  const params = timerange
    ? `?timerange=${timerange}&reverse_order=false&limit=300`
    : `?reverse_order=false&limit=300`;

  const { data, mutate, error, isLoading, isValidating } = useSWR<Segment[][]>(
    flows?.length > 0
      ? flows.map((flow) => `/flows/${flow.id}/segments${params}`)
      : null,
    async (paths: string[]) => {
      const responses = await Promise.all(
        paths.map((path) => paginationFetcher(path, api, maxResults)),
      );
      return responses;
    },
  );

  return {
    segments: data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};
