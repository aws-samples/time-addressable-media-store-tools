import { useNavigate, useParams } from "react-router-dom";
import { useState, useEffect } from "react";

import { useFlow } from "@/hooks/useFlows";

import { OmakasePlayerTamsComponent } from "./Omakase";
import { TimeRangeUtil } from "@byomakase/omakase-react-components";

import "@byomakase/omakase-react-components/dist/omakase-react-components.css";

import {
  useSegmentsOmakase,
  useSubflowsSegments,
} from "../../hooks/useSegments";
import { useChildFlows } from "../../hooks/useFlows";
import { Spinner } from "@cloudscape-design/components";

function findLongestTimerange(flows) {
  const range = flows.reduce((acc, currentFlow) => {
    const parsedTimeRange = TimeRangeUtil.parseTimeRange(currentFlow.timerange);

    if (
      parsedTimeRange.start === undefined ||
      parsedTimeRange.end === undefined
    ) {
      return acc;
    }
    const start = TimeRangeUtil.timeMomentToSeconds(parsedTimeRange.start);
    const end = TimeRangeUtil.timeMomentToSeconds(parsedTimeRange.end);
    if (!acc) {
      return { start, end };
    }

    return {
      start: start < acc.start ? start : acc.start,
      end: end > acc.end ? end : acc.end,
    };
  }, null);

  if (!range) {
    return undefined;
  }

  return TimeRangeUtil.formatTimeRangeExpr(
    TimeRangeUtil.toTimeRange(
      TimeRangeUtil.secondsToTimeMoment(range.start),
      TimeRangeUtil.secondsToTimeMoment(range.end),
      true,
      false
    )
  );
}

function resolveTimeRangeForLastNSeconds(timeRange, seconds) {
  if (!timeRange) {
    return undefined;
  }
  if (TimeRangeUtil.timerangeExprDuration(timeRange) < seconds) {
    return timeRange;
  }
  const parsedTimeRange = TimeRangeUtil.parseTimeRange(timeRange);
  const endTime = TimeRangeUtil.timeMomentToSeconds(parsedTimeRange.end);
  const startTime = endTime - seconds;

  const startMoment = TimeRangeUtil.secondsToTimeMoment(startTime);

  const newTimeRange = TimeRangeUtil.toTimeRange(
    startMoment,
    parsedTimeRange.end,
    true,
    true
  );
  return TimeRangeUtil.formatTimeRangeExpr(newTimeRange);
}

export const HlsPlayer = () => {
  const { type, id } = useParams();

  const { flow, isLoading: loadingFlow } = useFlow(id);

  let flowSegments;

  let childFlows = useChildFlows(flow?.flow_collection?.map((flow) => flow.id));

  const [timerange, setTimerange] = useState("[)");
  const [maxTimeRange, setMaxTimerange] = useState();

  flowSegments = useSegmentsOmakase(id, encodeURIComponent(timerange));

  const childFlowsSegmentsRaw = useSubflowsSegments(
    flow?.flow_collection,
    encodeURIComponent(timerange)
  );
  const subSegments = childFlowsSegmentsRaw?.segments?.map(
    (subSegment, index) => [childFlows?.flows?.at(index)?.id, subSegment]
  );

  const childFlowsSegments = new Map(subSegments);

  useEffect(() => {
    if (!loadingFlow && !childFlows.isLoading && (flow || childFlows.flows)) {
      const newMaxTimeRange = findLongestTimerange([
        ...(childFlows.flows ?? []),
        flow,
      ]);
      const resolvedTimeRange = resolveTimeRangeForLastNSeconds(
        newMaxTimeRange,
        300
      );
      setTimerange(resolvedTimeRange);
      setMaxTimerange(newMaxTimeRange);
    }
  }, [flow, childFlows.flows, loadingFlow, childFlows.isLoading]);

  return !loadingFlow &&
    !flowSegments.isLoading &&
    !childFlows.isLoading &&
    !childFlowsSegmentsRaw.isLoading &&
    timerange &&
    maxTimeRange ? (
    flow ? (
      <OmakasePlayerTamsComponent
        flow={flow}
        childFlows={childFlows.flows}
        flowSegments={flowSegments.segments}
        childFlowsSegments={childFlowsSegments}
        timeRange={timerange}
        maxTimeRange={maxTimeRange}
        setTimeRange={setTimerange}
        displayConfig={{}}
      />
    ) : (
      "Flow could not be fetched from backend"
    )
  ) : (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      Loading Media <Spinner />
    </div>
  );
};

export default HlsPlayer;
