import { useApi } from "@/hooks/useApi";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import paginationFetcher from "@/utils/paginationFetcher";
import type { Uuid, Flow, Timerange } from "@/types/tams"

type UpdateArg = {
  flowId: Uuid;
  status: string;
};

type DeleteArg = {
  flowId: Uuid;
};

type DeleteTimerangeArg = {
  flowId: Uuid;
  timerange: Timerange;
};

type SetReadOnlyArg = {
  flowId: Uuid;
  readOnly: boolean;
};


const useFlowsQuery = (url: string | null) => {
  const api = useApi();
  const { data, mutate, error, isLoading, isValidating } = useSWR<Flow[]>(
    url,
    (path) => paginationFetcher(path, api),
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

export const useFlows = () => useFlowsQuery("/flows?limit=300");

export const useFlowsBySource = (sourceId: Uuid) =>
  useFlowsQuery(sourceId ? `/flows?source_id=${sourceId}` : null);

export const useFlow = (flowId: Uuid) => {
  const { get } = useApi();
  const {
    data: response,
    mutate,
    error,
    isLoading,
    isValidating,
  } = useSWR<{ data: Flow; headers: Record<string, string>; nextLink?: string }>(
    ["/flows", flowId],
    ([path, flowId]) => get(`${path}/${flowId}?include_timerange=true`),
    {
      refreshInterval: 3000,
    }
  );

  return {
    flow: response?.data,
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
    (path, { arg }: { arg: DeleteArg }) =>
      del(`${path}/${arg.flowId}`).then((response) =>
        new Promise(resolve => setTimeout(() => resolve(response.data), 1000))
      ) // setTimeout used to artificially wait until basic deletes are complete.
  );

  return {
    del: trigger,
    isDeleting: isMutating,
  };
};

export const useDeleteTimerange = () => {
  const { del } = useApi();
  const { trigger, isMutating } = useSWRMutation("/flows", (path, { arg }: { arg: DeleteTimerangeArg }) =>
    del(`${path}/${arg.flowId}/segments?timerange=${arg.timerange}`).then(
      (response) => response.data
    )
  );

  return {
    delTimerange: trigger,
    isDeletingTimerange: isMutating,
  };
};

export const useFlowStatusTag = () => {
  const { put } = useApi();
  const { trigger, isMutating } = useSWRMutation("/flows", (path, { arg }: { arg: UpdateArg }) =>
    put(`${path}/${arg.flowId}/tags/flow_status`, arg.status).then(
      (response) => response.data
    )
  );

  return {
    update: trigger,
    isUpdating: isMutating,
  };
};

export const usePutReadOnly = () => {
  const { put } = useApi();
  const { trigger, isMutating } = useSWRMutation("/flows", (path, { arg }: { arg: SetReadOnlyArg }) =>
    put(`${path}/${arg.flowId}/read_only`, arg.readOnly).then(
      (response) => response.data
    )
  );

  return {
    putReadOnly: trigger,
    isPuttingReadOnly: isMutating,
  };
};
