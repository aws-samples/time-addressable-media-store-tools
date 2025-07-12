import {
  toTimerangeString,
  parseTimerange,
} from "@/utils/timerange";

import paginationFetcher from "@/utils/paginationFetcher";
import { useApi } from "@/hooks/useApi";

const DEFAULT_SEGMENTATION_DURATION = 300;
const NANOS_PER_SECOND = 1_000_000_000n;

const shouldExcludeFlow = (flow) =>
  flow.tags?.hls_exclude?.toLowerCase() === "true";

const getFlowAndRelated = async ({ type, id }) => {
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
  const sortedRelatedFlows = relatedFlows.sort(
    (a, b) => a.avg_bit_rate - b.avg_bit_rate
  );
  return { flow, relatedFlows: sortedRelatedFlows };
};

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

const getMaxTimerange = (flows) => {
  if (!flows.length) return { start: null, end: null };

  let minStart = flows[0].timerange.start;
  let maxEnd = flows[0].timerange.end;

  for (let i = 1; i < flows.length; i++) {
    const { start, end } = flows[i].timerange;
    if (start < minStart) minStart = start;
    if (end > maxEnd) maxEnd = end;
  }

  return { start: minStart, end: maxEnd };
};

const parseAndFilterFlows = (flows) => {
  const result = [];
  const validFormats = new Set([
    "urn:x-nmos:format:video",
    "urn:x-nmos:format:audio",
  ]);

  for (const flow of flows) {
    if (!validFormats.has(flow.format)) continue;

    try {
      const parsedTimerange = parseTimerange(flow.timerange);
      if (
        parsedTimerange.start !== undefined &&
        parsedTimerange.end !== undefined
      ) {
        result.push({ ...flow, timerange: parsedTimerange });
      }
    } catch (error) {
      // Skip flows with parsing errors
    }
  }

  return result;
};

const getSegmentationTimerange = async (flows) => {
  // Filter for video flows, Video must take priority if any are present
  const videoFlows = flows.filter(
    ({ format }) => format === "urn:x-nmos:format:video"
  );

  // Determine which flows to use for calculation
  const flowsToUse = videoFlows.length > 0 ? videoFlows : flows;

  if (flowsToUse.length === 0) {
    return {
      timerange: { start: null, end: null },
      flowId: null,
      segments: null,
    };
  }

  // Find the flow with the earliest end time
  const earliestEndFlow = flowsToUse.reduce((earliest, current) =>
    current.timerange.end < earliest.timerange.end ? current : earliest
  );

  const windowTimerange = {
    start:
      earliestEndFlow.timerange.end -
      BigInt(DEFAULT_SEGMENTATION_DURATION) * NANOS_PER_SECOND,
    end: earliestEndFlow.timerange.end,
  };

  const windowSegments = await paginationFetcher(
    `/flows/${
      earliestEndFlow.id
    }/segments?limit=300&timerange=${toTimerangeString(windowTimerange)}`
  );

  if (windowSegments.length === 0) {
    return {
      timerange: { start: null, end: null },
      flowId: null,
      segments: null,
    };
  }

  if (windowSegments.length === 1) {
    return {
      timerange: parseTimerange(windowSegments[0].timerange),
      flowId: null,
      segments: null,
    };
  }

  return {
    timerange: {
      start: parseTimerange(windowSegments[0].timerange).start,
      end: parseTimerange(
        windowSegments[windowSegments.length - 1].timerange
      ).end,
    },
    flowId: earliestEndFlow.id,
    segments: windowSegments,
  };
};

const getOmakaseData = async ({ type, id, timerange }) => {
  const { flow, relatedFlows } = await getFlowAndRelated({ type, id });
  const timerangeValidFlows = parseAndFilterFlows([flow, ...relatedFlows]);

  const maxTimerange = getMaxTimerange(timerangeValidFlows);
  const parsedMaxTimerange = toTimerangeString(maxTimerange);

  const segmentsCache = {};

  let parsedTimerange = timerange;
  let segmentationResult = null;

  if (!timerange) {
    segmentationResult = await getSegmentationTimerange(timerangeValidFlows);
    parsedTimerange = toTimerangeString(segmentationResult.timerange);

    // Cache the segments if they were fetched
    if (segmentationResult.flowId && segmentationResult.segments) {
      segmentsCache[segmentationResult.flowId] = segmentationResult.segments;
    }
  }

  const fetchPromises = [];
  // Add simple promises for segments already retrieved
  Object.entries(segmentsCache).forEach((entry) =>
    fetchPromises.push(Promise.resolve(entry))
  );
  // Add promises for all remaining flow segment requests
  [flow.id, ...relatedFlows.map(({ id }) => id)]
    .filter((id) => !(id in segmentsCache))
    .forEach((id) =>
      fetchPromises.push(
        paginationFetcher(
          `/flows/${id}/segments?limit=300&timerange=${parsedTimerange}`
        ).then((result) => [id, result])
      )
    );

  const flowSegments = Object.fromEntries(await Promise.all(fetchPromises));

  return {
    flow,
    relatedFlows,
    flowSegments,
    maxTimerange: parsedMaxTimerange,
    timerange: parsedTimerange,
  };
};

export default getOmakaseData;
