import "@byomakase/omakase-react-components/dist/omakase-react-components.css";

import { OmakasePlayerTamsComponent } from ".";
import { Spinner } from "@cloudscape-design/components";
import { useOmakaseData } from "../../hooks/useOmakaseData";
import { useParams } from "react-router-dom";
import { useState } from "react";

export const OmakaseHlsPlayer = () => {
  const { type, id } = useParams();
  const [timerange, setTimerange] = useState();

  const {
    flow,
    relatedFlows: filteredChildFlows,
    flowSegments,
    timerange: calculatedTimerange,
    maxTimerange,
    isLoading,
  } = useOmakaseData(type, id, timerange);

  if (!isLoading && !flow) {
    return <div>{`No valid ${type} found`}</div>;
  }
  if (!isLoading) {
    const hasSegments =
      Object.values(flowSegments).find((segments) => segments.length > 0) !=
      undefined;

    if (!hasSegments) {
      return <div>Selected timerange has no segments</div>;
    }
  }

  return !isLoading ? (
    <OmakasePlayerTamsComponent
      flow={flow}
      childFlows={filteredChildFlows}
      flowsSegments={new Map(Object.entries(flowSegments))}
      timeRange={calculatedTimerange}
      maxTimeRange={maxTimerange}
      setTimeRange={setTimerange}
      displayConfig={{}}
    />
  ) : (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      Loading Media <Spinner />
    </div>
  );
};

export default OmakaseHlsPlayer;

// Flow could not be fetched from backend

// if (
//   flow &&
//   (flow.tags?.hls_exclude === "true" ||
//     flow.tags?.hls_exclude === true ||
//     flow.tags?.hls_exclude === "1" ||
//     flow.tags?.hls_exclude === 1)
// ) {
//   return <div>Flow is excluded from HLS</div>;
// }

//   if (
//     !loadingFlow &&
//     !childFlows.isLoading &&
//     !childFlowsSegmentsRaw.isLoading &&
//     !flowSegments.isLoading &&
//     !containsAudioOrVideoFlow(flow, filteredChildFlows) &&
//     (flow || filteredChildFlows)
//   ) {
//     return <div>Selected {type} don’t contain video or audio</div>;
//   }
