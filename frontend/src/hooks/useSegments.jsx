import {useApi, useApiRaw} from "@/hooks/useApi";
import useSWR from "swr";

export const useSegments = (flowId) => {
  const { get } = useApi();
  const { data, mutate, error, isLoading, isValidating } = useSWR(
    `/flows/${flowId}/segments`,
    (path) => get(`${path}?accept_get_urls=&reverse_order=true`),
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

export const useSegmentsOmakase = (flowId, timerange, maxPages = 10) => {
  const { get } = useApiRaw();

  const fetchSegments = async (path, accumulatedData = [], pageCount = 0) => {
    if (pageCount >= maxPages) return accumulatedData; // Stop if maxPages reached

    const response = await get(path);
    if (!response) return accumulatedData;

    const body = await response.body?.json(); // Convert body to JSON
    if (!body) return accumulatedData;

    const newSegments = body || [];
    const nextKey = response.headers?.["x-paging-nextkey"];

    const allSegments = [...accumulatedData, ...newSegments];

    if (nextKey) {
      return fetchSegments(
          `/flows/${flowId}/segments?page=${nextKey}`,
          allSegments,
          pageCount + 1
      );
    }

    return allSegments;
  };

  const { data, mutate, error, isLoading, isValidating } = useSWR(
      `/flows/${flowId}/segments${
          timerange ? `?timerange=${timerange}` : ""
      }&reverse_order=false&limit=300`,
      async (path) => fetchSegments(path),
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

export const useSubflowsSegments = (flows, timerange, maxPages = 10) => {
  const { get } = useApiRaw();

  const fetchSegments = async (path, accumulatedData = [], pageCount = 0) => {
    if (pageCount >= maxPages) return accumulatedData; // Stop if maxPages reached

    const response = await get(path);

    if (!response) return accumulatedData;

    const body = await response.body?.json(); // Convert body to JSON
    if (!body) return accumulatedData;

    const newSegments = body || [];
    const nextKey = response.headers?.["x-paging-nextkey"];

    const allSegments = [...accumulatedData, ...newSegments];

    if (nextKey) {
      return fetchSegments(
          `${path}&page=${nextKey}`, // Continue fetching next page
          allSegments,
          pageCount + 1
      );
    }

    return allSegments;
  };

  const params = timerange
      ? `?timerange=${timerange}&reverse_order=false&limit=1000`
      : `?reverse_order=false&limit=1000`;

  const { data, mutate, error, isLoading, isValidating } = useSWR(
      flows?.length > 0
          ? flows.map((flow) => `/flows/${flow.id}/segments${params}`)
          : null,
      async (paths) => {
        const responses = await Promise.all(
            paths.map((path) => fetchSegments(path))
        );
        return responses;
      },
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
