import { useApi } from "@/hooks/useApi";
import useSWR from "swr";
import paginationFetcher from "@/utils/paginationFetcher";
import { TAMS_PAGE_LIMIT, TAMS_POLLING_INTERVAL } from "@/constants";
import type { Uuid, Timerange, Flow, Segment } from "@/types/tams";

export const useLastN = (flowId: Uuid, n: number) => {
  const api = useApi();
  const { data, mutate, error, isLoading, isValidating } = useSWR<Segment[]>(
    `/flows/${flowId}/segments`,
    (path: string) =>
      paginationFetcher<Segment>(
        `${path}?accept_get_urls=&reverse_order=true&include_object_timerange=true`,
        api,
        n,
      ),
    {
      refreshInterval: TAMS_POLLING_INTERVAL,
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
      paginationFetcher<Segment>(
        `${path}${
          timerange ? `?timerange=${timerange}` : ""
        }&reverse_order=false&limit=${TAMS_PAGE_LIMIT}`,
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
    ? `?timerange=${timerange}&reverse_order=false&limit=${TAMS_PAGE_LIMIT}`
    : `?reverse_order=false&limit=${TAMS_PAGE_LIMIT}`;

  const { data, mutate, error, isLoading, isValidating } = useSWR<Segment[][]>(
    flows?.length > 0
      ? flows.map((flow) => `/flows/${flow.id}/segments${params}`)
      : null,
    async (paths: string[]) => {
      const responses = await Promise.all(
        paths.map((path) => paginationFetcher<Segment>(path, api, maxResults)),
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
