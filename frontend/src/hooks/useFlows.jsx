import getOmakaseData from "../utils/getOmakaseData";
import paginationFetcher from "@/utils/paginationFetcher";
import { parseTimerangeObj } from "@/utils/parseTimerange";
import { useApi } from "@/hooks/useApi";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";

export const useFlows = () => {
  const { data, mutate, error, isLoading, isValidating } = useSWR(
    "/flows?limit=300",
    paginationFetcher,
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

export const useFlow = (flowId) => {
  const { get } = useApi();
  const {
    data: response,
    mutate,
    error,
    isLoading,
    isValidating,
  } = useSWR(
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

export const useChildFlows = (flowIds) => {
  const { get } = useApi();

  const { data, mutate, error, isLoading, isValidating } = useSWR(
    flowIds?.length > 0 ? flowIds.map((id) => ["/flows", id]) : null,
    async (keys) => {
      const responses = await Promise.all(
        keys.map(([path, id]) =>
          get(`${path}/${id}?include_timerange=true`).then((resp) => resp.data)
        )
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
        setTimeout(response.data, 1000)
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
  const { trigger, isMutating } = useSWRMutation("/flows", (path, { arg }) =>
    put(`${path}/${arg.flowId}/tags/flow_status`, arg.status).then(
      (response) => response.data
    )
  );

  return {
    update: trigger,
    isUpdating: isMutating,
  };
};

export const useOmakaseData = (type, id, timerange) => {
  const {
    data: response,
    error,
    isLoading,
    isValidating,
  } = useSWR(
    ["/omakase-data", type, id, timerange],
    async ([_, type, id, timerange]) => {
      const {
        flow,
        relatedFlows,
        flowSegments,
        maxTimerange,
        timerange: segmentsTimerange,
      } = await getOmakaseData({ type, id, timerange });

      return {
        flow,
        relatedFlows,
        flowSegments,
        maxTimerange: parseTimerangeObj(maxTimerange),
        timerange: segmentsTimerange,
      };
    }
  );
  return {
    flow: response?.flow,
    relatedFlows: response?.relatedFlows,
    flowSegments: response?.flowSegments,
    maxTimerange: response?.maxTimerange,
    timerange: response?.timerange,
    isLoading,
    isValidating,
    error,
  };
};
