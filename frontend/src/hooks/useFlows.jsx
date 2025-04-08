import { TAMS_PAGE_LIMIT } from "@/constants";
import { useApi } from "@/hooks/useApi";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";

export const useFlows = () => {
  const { get } = useApi();
  const { data, mutate, error, isLoading, isValidating } = useSWR(
    "/flows",
    (path) => get(`${path}?limit=${TAMS_PAGE_LIMIT}`)
  );

  return {
    flows: data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export const useFlow = (flowId) => {
  const { get } = useApi();
  const { data, mutate, error, isLoading, isValidating } = useSWR(
    flowId !== undefined ? ["/flows", flowId] : null,
    ([path, flowId]) => get(`${path}/${flowId}?include_timerange=true`),
    get,
    {
      refreshInterval: 3000,
    }
  );

  return {
    flow: data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export const useChildFlows = (flowIds) => {
  const { get } = useApi();

  const { data, mutate, error, isLoading, isValidating } = useSWR(
    flowIds?.length > 0 ? flowIds.map((id) => ["/flows", id]) : null,
    async (keys) => {
      const responses = await Promise.all(
        keys.map(([path, id]) => get(`${path}/${id}?include_timerange=true`))
      );
      return responses;
    },
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

export const useDelete = () => {
  const { del } = useApi();
  const { trigger, isMutating } = useSWRMutation(
    "/flows",
    (path, { arg }) =>
      del(`${path}/${arg.flowId}`).then((response) =>
        setTimeout(response, 1000)
      ) // setTimeout used to artificially wait until basic deletes are complete.
  );

  return {
    del: trigger,
    isDeleting: isMutating,
  };
};

export const useDeleteTimerange = () => {
  const { del } = useApi();
  const { trigger, isMutating } = useSWRMutation("/flows", (path, { arg }) =>
    del(`${path}/${arg.flowId}/segments?timerange=${arg.timerange}`)
  );

  return {
    delTimerange: trigger,
    isDeletingTimerange: isMutating,
  };
};

export const useFlowStatusTag = () => {
  const { put } = useApi();
  const { trigger, isMutating } = useSWRMutation("/flows", (path, { arg }) =>
    put(`${path}/${arg.flowId}/tags/flow_status`, arg.status)
  );

  return {
    update: trigger,
    isUpdating: isMutating,
  };
};
