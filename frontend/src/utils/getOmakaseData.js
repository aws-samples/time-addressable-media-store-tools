import { parseTimerangeObj, parseTimerangeStr } from "@/utils/parseTimerange";

import { DateTime } from "luxon";
import paginationFetcher from "@/utils/paginationFetcher";
import { useApi } from "@/hooks/useApi";
import { TimeRangeUtil } from "../views/OmakasePlayer/util/time-range-util";

const DEFAULT_SEGMENTATION_DURATION = 300;

const shouldExcludeFlow = (flow) =>
  flow.tags?.hls_exclude?.toLowerCase() === "true";

const getFlowAndQueue = async ({ type, id }) => {
  const { get } = useApi();
  let flow = {};
  const relatedFlowQueue = [];

  if (type === "flows") {
    const flowData = (await get(`/flows/${id}?include_timerange=true`)).data;
    if (shouldExcludeFlow(flowData)) {
      console.error("No valid Flows found.");
      return { flow: null, relatedFlows: [] };
    }
    flow = flowData;
  } else {
    const sourceFlows = (await get(`/flows/?source_id=${id}`)).data;
    const filteredSourceFlows = sourceFlows.filter(
      (sourceFlow) => !shouldExcludeFlow(sourceFlow)
    );

    if (filteredSourceFlows.length === 0) {
      console.error("No valid Flows found.");
      return { flow: null, relatedFlows: [] };
    }

    flow = (
      await get(`/flows/${filteredSourceFlows[0].id}?include_timerange=true`)
    ).data;
    relatedFlowQueue.push(...filteredSourceFlows.slice(1).map(({ id }) => id));
  }

  if (flow.flow_collection) {
    relatedFlowQueue.push(...flow.flow_collection.map(({ id }) => id));
  }

  const relatedFlows = await getFlowHierarchy(relatedFlowQueue);
  return { flow, relatedFlows };
};

function findLongestTimerange(flows) {
  const range = flows.reduce((acc, currentFlow) => {
    const parsedTimeRange = TimeRangeUtil.parseTimeRange(currentFlow.timerange);

    if (
      parsedTimeRange.start === undefined ||
      parsedTimeRange.end === undefined
    ) {
      return acc;
    }
    const start =
      TimeRangeUtil.timeMomentToMilliseconds(parsedTimeRange.start) * 1_000_000;
    const end =
      TimeRangeUtil.timeMomentToMilliseconds(parsedTimeRange.end) * 1_000_000;
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
      TimeRangeUtil.nanosecondsToTimeMoment(range.start),
      TimeRangeUtil.nanosecondsToTimeMoment(range.end),
      true,
      false
    )
  );
}

const getFlowHierarchy = async (relatedFlowQueue) => {
  const { get } = useApi();
  const relatedFlows = [];
  const checkedFlowIds = new Set();

  while (relatedFlowQueue.length > 0) {
    const relatedFlowId = relatedFlowQueue.pop();
    checkedFlowIds.add(relatedFlowId);

    const flowData = (
      await get(`/flows/${relatedFlowId}?include_timerange=true`)
    ).data;

    if (!shouldExcludeFlow(flowData)) {
      relatedFlows.push(flowData);
    }

    if (flowData.flow_collection) {
      const newFlowIds = flowData.flow_collection
        .filter(({ id }) => !checkedFlowIds.has(id))
        .map(({ id }) => id);

      relatedFlowQueue.push(...newFlowIds);
    }
  }

  return relatedFlows;
};

const getMaxTimerange = ({ flow, relatedFlows }) => {
  const allTimeranges = [
    parseTimerangeStr(flow.timerange),
    ...relatedFlows.map(({ timerange }) => parseTimerangeStr(timerange)),
  ];

  const validStartTimes = allTimeranges
    .filter(({ start }) => start)
    .map(({ start }) => start);

  const validEndTimes = allTimeranges
    .filter(({ end }) => end)
    .map(({ end }) => end);

  return {
    start: validStartTimes.length ? DateTime.max(...validStartTimes) : null,
    end: validEndTimes.length ? DateTime.min(...validEndTimes) : null,
  };
};

function findLongestTimerangeFromSegments(flowSegments, timerange) {
  const parsedTimerange = TimeRangeUtil.parseTimeRange(timerange);
  const start = TimeRangeUtil.timeMomentToNanoseconds(parsedTimerange.start);
  const end = TimeRangeUtil.timeMomentToNanoseconds(parsedTimerange.end);
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

      const start = TimeRangeUtil.timeMomentToNanoseconds(
        TimeRangeUtil.parseTimeRange(firstSegment.timerange).start
      );
      const end = TimeRangeUtil.timeMomentToNanoseconds(
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
      TimeRangeUtil.nanosecondsToTimeMoment(range.start),
      TimeRangeUtil.nanosecondsToTimeMoment(range.end),
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
  const endTime = TimeRangeUtil.timeMomentToNanoseconds(parsedTimeRange.end);
  const startTime = endTime - seconds * 1_000_000_000;

  const startMoment = TimeRangeUtil.nanosecondsToTimeMoment(startTime);

  const newTimeRange = TimeRangeUtil.toTimeRange(
    startMoment,
    parsedTimeRange.end,
    true,
    false
  );
  return TimeRangeUtil.formatTimeRangeExpr(newTimeRange);
}

const getOmakaseData = async ({ type, id, timerange }) => {
  let { flow, relatedFlows } = await getFlowAndQueue({ type, id });
  relatedFlows = relatedFlows.sort((a, b) => a.avg_bit_rate - b.avg_bit_rate);
  const maxTimerange = getMaxTimerange({ flow, relatedFlows });
  const maxTimerangeDuration =
    maxTimerange.end.toSeconds() - maxTimerange.start.toSeconds();

  if (timerange) {
    // player requested a specific timerange
    const segmentsTimerange = timerange;

    const parsedMaxTimeRange = parseTimerangeObj(maxTimerange);
    const fetchPromises = [
      paginationFetcher(
        `/flows/${flow.id}/segments?limit=300&timerange=${segmentsTimerange}`
      ).then((result) => [flow.id, result]),
      ...relatedFlows.map(({ id }) =>
        paginationFetcher(
          `/flows/${id}/segments?limit=300&timerange=${segmentsTimerange}`
        ).then((result) => [id, result])
      ),
    ];
    const flowSegments = Object.fromEntries(await Promise.all(fetchPromises));
    return {
      flow,
      relatedFlows,
      flowSegments,
      maxTimerange: parsedMaxTimeRange,
      timerange: segmentsTimerange,
    };
  } else {
    // initial player load, since there is no specified time range, we use a simple
    // heuristic to find DEFAULT_SEGMENTATION_DURATION seconds of playable content

    // const segmentsTimerange = parseTimerangeObj({
    //   includesStart: true,
    //   start:
    //     maxTimerangeDuration > DEFAULT_SEGMENTATION_DURATION
    //       ? DateTime.fromSeconds(
    //           maxTimerange.end.toSeconds() - DEFAULT_SEGMENTATION_DURATION
    //         )
    //       : maxTimerange.start,
    //   end: maxTimerange.end,
    //   includesEnd: false,
    // });
    const totalTimerange = findLongestTimerange([flow, ...relatedFlows]);
    const segmentsTimerange = resolveTimeRangeForLastNSeconds(
      totalTimerange,
      DEFAULT_SEGMENTATION_DURATION
    );
    const parsedMaxTimeRange = parseTimerangeObj(maxTimerange);
    let fetchPromises = [
      paginationFetcher(
        `/flows/${flow.id}/segments?limit=300&timerange=${segmentsTimerange}`
      ).then((result) => [flow.id, result]),
      ...relatedFlows.map(({ id }) =>
        paginationFetcher(
          `/flows/${id}/segments?limit=300&timerange=${segmentsTimerange}`
        ).then((result) => [id, result])
      ),
    ];
    // initial flow segments, the issue might arise if a certain subflow is much longer than others
    // so we don't immediately use given segments since the video might not be playable (e.g. only thumbnails)
    const initialFlowSegments = Object.fromEntries(
      await Promise.all(fetchPromises)
    );

    // longest timerange present in segments
    const longestTimerangeFromSegments = findLongestTimerangeFromSegments(
      Object.values(initialFlowSegments),
      segmentsTimerange
    );

    // we use the latest time moment where all segments are present and then calculate the start time moment
    const validRequiredLengthTimerange = resolveTimeRangeForLastNSeconds(
      TimeRangeUtil.formatTimeRangeExpr(
        TimeRangeUtil.toTimeRange(
          TimeRangeUtil.parseTimeRange(parsedMaxTimeRange).start,

          TimeRangeUtil.parseTimeRange(longestTimerangeFromSegments).end,
          true,
          false
        )
      ),
      DEFAULT_SEGMENTATION_DURATION
    );

    fetchPromises = [
      paginationFetcher(
        `/flows/${flow.id}/segments?limit=300&timerange=${validRequiredLengthTimerange}`
      ).then((result) => [flow.id, result]),
      ...relatedFlows.map(({ id }) =>
        paginationFetcher(
          `/flows/${id}/segments?limit=300&timerange=${validRequiredLengthTimerange}`
        ).then((result) => [id, result])
      ),
    ];

    const flowSegments = Object.fromEntries(await Promise.all(fetchPromises));

    return {
      flow,
      relatedFlows,
      flowSegments,
      maxTimerange: parsedMaxTimeRange,
      timerange: validRequiredLengthTimerange,
    };
  }
};

export default getOmakaseData;
