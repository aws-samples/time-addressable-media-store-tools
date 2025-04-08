import { TAMS_PAGE_LIMIT } from "@/constants";
import { useApi } from "@/hooks/useApi";
import useSWR from "swr";

export const useSources = () => {
  const { get } = useApi();
  const { data, mutate, error, isLoading, isValidating } = useSWR(
    "/sources",
    (path) => get(`${path}?limit=${TAMS_PAGE_LIMIT}`),
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
  const { data, mutate, error, isLoading, isValidating } = useSWR(
    ["/sources", sourceId],
    ([path, sourceId]) => get(`${path}/${sourceId}`),
    {
      refreshInterval: 3000,
    }
  );

  return {
    source: data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export const useSourceFlows = (sourceId) => {
  const { get } = useApi();
  const { data, mutate, error, isLoading, isValidating } = useSWR(
    sourceId !== undefined ? ["/flows", sourceId] : null,
    ([path, sourceId]) => get(`${path}?source_id=${sourceId}`),
    {
      refreshInterval: 3000,
    }
  );

  return {
    flows: data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export const useSourceFlowsWithTimerange = (sourceId) => {
  const { get } = useApi();

  const {
    data: flows,
    mutate: mutateFlows,
    error: flowsError,
    isLoading: flowsLoading,
    isValidating: flowsValidating,
  } = useSWR(
    sourceId ? [`/flows`, sourceId] : null,
    ([path, sourceId]) => get(`${path}?source_id=${sourceId}`),
    { refreshInterval: 3000 }
  );

  const firstFlowId = flows?.length > 0 ? flows[0].id : null;

  const {
    data: flow,
    mutate: mutateFlow,
    error: flowError,
    isLoading: flowLoading,
    isValidating: flowValidating,
  } = useSWR(
    firstFlowId ? [`/flows/${firstFlowId}`] : null,
    ([path]) => get(`${path}?include_timerange=true`),
    { refreshInterval: 3000 }
  );

  return {
    flows,
    firstFlow: flow,
    mutateFlows,
    mutateFlow,
    isLoading: flowsLoading || flowLoading,
    isValidating: flowsValidating || flowValidating,
    error: flowsError || flowError,
  };
};
