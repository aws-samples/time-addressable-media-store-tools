import useSWR from "swr";
import paginationFetcher from "@/utils/paginationFetcher";

export const useLastN = (flowId, n) => {
  const { data, mutate, error, isLoading, isValidating } = useSWR(
    `/flows/${flowId}/segments`,
    (path) =>
      paginationFetcher(`${path}?accept_get_urls=&reverse_order=true`, n),
    {
      refreshInterval: 3000,
    }
  );

  return {
    segments: data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export const useSegments = (flowId, timerange, maxResults = 3000) => {
  const { data, mutate, error, isLoading, isValidating } = useSWR(
    `/flows/${flowId}/segments`,
    (path) =>
      paginationFetcher(
        `${path}${
          timerange ? `?timerange=${timerange}` : ""
        }&reverse_order=false&limit=300`,
        maxResults
      )
  );

  return {
    segments: data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export const useFlowsSegments = (flows, timerange, maxResults = 3000) => {
  const params = timerange
    ? `?timerange=${timerange}&reverse_order=false&limit=300`
    : `?reverse_order=false&limit=300`;

  const { data, mutate, error, isLoading, isValidating } = useSWR(
    flows?.length > 0
      ? flows.map((flow) => `/flows/${flow.id}/segments${params}`)
      : null,
    async (paths) => {
      const responses = await Promise.all(
        paths.map((path) => paginationFetcher(path, maxResults))
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
