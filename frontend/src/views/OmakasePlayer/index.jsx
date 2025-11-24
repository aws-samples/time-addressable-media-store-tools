import "@byomakase/omakase-react-components/dist/omakase-react-components.css";

import { OmakasePlayerTamsComponent } from ".";
import { Spinner, Box } from "@cloudscape-design/components";
import { useOmakaseData } from "@/hooks/useOmakaseData";
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
    return <Box textAlign="center">{`No valid ${type} found`}</Box>;
  }
  if (!isLoading) {
    const hasSegments =
      Object.values(flowSegments).find((segments) => segments.length > 0) !=
      undefined;

    if (!hasSegments) {
      return <Box textAlign="center">Selected timerange has no segments</Box>;
    }
  }

  return !isLoading ? (
    <Box>
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
    </Box>
  ) : (
    <Box textAlign="center">
      Loading Media <Spinner />
    </Box>
  );
};

export default OmakaseHlsPlayer;
