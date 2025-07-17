import getOmakaseData from "../utils/getOmakaseData";
import useSWR from "swr";

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
        maxTimerange,
        timerange: segmentsTimerange,
      };
    }
  );
  return {
    sourceId: type === "sources" ? id : response?.flow.source_id,
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
