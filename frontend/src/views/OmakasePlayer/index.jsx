import { useNavigate, useParams } from "react-router-dom";
import { useState, useEffect, useRef } from "react";

import { useFlow } from "@/hooks/useFlows";

import { useSourceFlowsWithTimerange } from "@/hooks/useSources";

import { OmakasePlayerTamsComponent } from ".";
import { TimeRangeUtil } from "@byomakase/omakase-react-components";

import "@byomakase/omakase-react-components/dist/omakase-react-components.css";

import {
  useSegments,
  useFlowsSegments,
} from "../../hooks/useSegments";
import { useChildFlows } from "../../hooks/useFlows";
import { Spinner } from "@cloudscape-design/components";

function containsAudioOrVideoFlow(flow, childFlows) {
  if (
    flow?.format !== "urn:x-nmos:format:video" &&
    flow?.format !== "urn:x-nmos:format:audio"
  ) {
    if (
      childFlows?.find(
        (childFlow) =>
          childFlow.format === "urn:x-nmos:format:video" ||
          childFlow.format === "urn:x-nmos:format:audio"
      )
    ) {
      return true;
    }

    return false;
  }

  return true;
}

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
      start: start > acc.start ? start : acc.start,
      end: end < acc.end ? end : acc.end,
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

function findLongestTimerangeFromSegments(flowSegments, timerange) {
  const parsedTimerange = TimeRangeUtil.parseTimeRange(timerange);
  console.log(timerange, parsedTimerange);
  const start = TimeRangeUtil.timeMomentToSeconds(parsedTimerange.start);
  const end = TimeRangeUtil.timeMomentToSeconds(parsedTimerange.end);
  const range = flowSegments.reduce(
    (acc, currentSegments) => {
      if (currentSegments.length === 0) {
        return acc;
      }

      const firstSegment = currentSegments.at(0);
      const lastSegment = currentSegments.at(-1);

      if (
        TimeRangeUtil.parseTimeRange(lastSegment.timerange).end === undefined
      ) {
        return acc;
      }

      const start = TimeRangeUtil.timeMomentToSeconds(
        TimeRangeUtil.parseTimeRange(firstSegment.timerange).start
      );
      const end = TimeRangeUtil.timeMomentToSeconds(
        TimeRangeUtil.parseTimeRange(lastSegment.timerange).end
      );

      if (start === undefined || end === undefined) {
        return acc;
      }

      return {
        start: start > acc.start ? start : acc.start,
        end: end < acc.end ? end : acc.end,
      };
    },
    {
      start: start,
      end: end,
    }
  );

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

export const OmakaseHlsPlayer = () => {
  const { type, id } = useParams();

  const isTimeRangeFromSegmentsCalculated = useRef(false);

  const flowFromFlow = useFlow(type === "flows" ? id : undefined);
  const flowsFromSource = useSourceFlowsWithTimerange(
    type === "sources" ? id : undefined
  );

  let flow, loadingFlow;
  if (type === "flows") {
    flow = flowFromFlow.flow;
    loadingFlow = flowFromFlow.loading;
  } else {
    flow = flowsFromSource.firstFlow;
    loadingFlow = flowsFromSource.loading;
  }

  let flowSegments;

  let childFlows = useChildFlows(flow?.flow_collection?.map((flow) => flow.id));
  let filteredChildFlows = childFlows.flows;

  if (childFlows.flows) {
    flow = structuredClone(flow);
    filteredChildFlows = childFlows.flows.filter((childFlow) => {
      return !(
        childFlow.tags?.hls_exclude === "true" ||
        childFlow.tags?.hls_exclude === true ||
        childFlow.tags?.hls_exclude === "1" ||
        childFlow.tags?.hls_exclude === 1
      );
    });

    const hlsIncludedFlows = filteredChildFlows.map((flow) => flow.id);

    flow.flow_collection = flow.flow_collection.filter((collectedFlow) =>
      hlsIncludedFlows.includes(collectedFlow.id)
    );
  }

  const [timerange, setTimerange] = useState("[)");
  const [maxTimeRange, setMaxTimerange] = useState();

  flowSegments = useSegments(flow?.id, timerange);

  const childFlowsSegmentsRaw = useFlowsSegments(
    flow?.flow_collection,
    encodeURIComponent(timerange)
  );
  const subSegments = childFlowsSegmentsRaw?.segments?.map(
    (subSegment, index) => [filteredChildFlows?.at(index)?.id, subSegment]
  );

  const childFlowsSegments = new Map(subSegments);

  useEffect(() => {
    if (!loadingFlow && !childFlows.isLoading && (flow || childFlows.flows)) {
      const newMaxTimeRange = findLongestTimerange([
        ...(filteredChildFlows ?? []),
        flow,
      ]);
      const resolvedTimeRange = resolveTimeRangeForLastNSeconds(
        newMaxTimeRange,
        300
      );
      setTimerange((prev) => {
        return prev === "[)" ? resolvedTimeRange : prev;
      });
      setMaxTimerange(newMaxTimeRange);
    }
  }, [flow, filteredChildFlows?.length]);

  useEffect(() => {
    if (
      timerange !== "[)" &&
      timerange != undefined &&
      !flowSegments.isLoading &&
      !childFlowsSegmentsRaw.isLoading &&
      !isTimeRangeFromSegmentsCalculated.current
    ) {
      console.log(timerange);

      const segmentMaxRange = findLongestTimerangeFromSegments(
        [flowSegments.segments, ...childFlowsSegments.values()],
        timerange
      );

      const parsedSegmentTimeRange =
        TimeRangeUtil.parseTimeRange(segmentMaxRange);
      const parsedMaxRange = TimeRangeUtil.parseTimeRange(maxTimeRange);
      const newTimeRange = resolveTimeRangeForLastNSeconds(
        TimeRangeUtil.formatTimeRangeExpr(
          TimeRangeUtil.toTimeRange(
            parsedMaxRange.start,
            parsedSegmentTimeRange.end,
            true,
            false
          )
        ),
        300
      );

      setTimerange(newTimeRange);
      isTimeRangeFromSegmentsCalculated.current = true;
    }
  });

  if (
    flow &&
    (flow.tags?.hls_exclude === "true" ||
      flow.tags?.hls_exclude === true ||
      flow.tags?.hls_exclude === "1" ||
      flow.tags?.hls_exclude === 1)
  ) {
    return <div>Flow is excluded from HLS</div>;
  }

  if (
    !loadingFlow &&
    !childFlows.isLoading &&
    !childFlowsSegmentsRaw.isLoading &&
    !flowSegments.isLoading &&
    !containsAudioOrVideoFlow(flow, filteredChildFlows) &&
    (flow || filteredChildFlows)
  ) {
    return <div>Selected {type} don’t contain video or audio</div>;
  }

  return !loadingFlow &&
    !flowSegments.isLoading &&
    !childFlows.isLoading &&
    !childFlowsSegmentsRaw.isLoading &&
    timerange &&
    isTimeRangeFromSegmentsCalculated.current &&
    maxTimeRange ? (
    flow ? (
      <OmakasePlayerTamsComponent
        flow={flow}
        childFlows={filteredChildFlows}
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

export default OmakaseHlsPlayer;
