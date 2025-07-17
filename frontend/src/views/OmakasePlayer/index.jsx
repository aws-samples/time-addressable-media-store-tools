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
    sourceId,
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
      sourceId={sourceId}
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
