import { toTimerangeString, parseTimerange } from "@/utils/timerange";
import paginationFetcher from "@/utils/paginationFetcher";
import type { Flow, Uuid, Segment } from "@/types/tams";
import type { ApiClient } from "@/types/utils";

type TimerangeMinMax = {
  start: bigint | null;
  end: bigint | null;
};

type FlowWithParsedTimerange = Omit<Flow, "timerange"> & {
  timerange: {
    includesStart: boolean;
    start: bigint;
    end: bigint;
    includesEnd: boolean;
  };
};

type SegmentationResult = {
  timerange: TimerangeMinMax;
  flowId: Uuid | null;
  segments: Segment[] | null;
};

const DEFAULT_SEGMENTATION_DURATION = 300;
const NANOS_PER_SECOND = 1_000_000_000n;

const shouldExcludeFlow = (flow: Flow) => {
  const hlsExclude = flow.tags?.hls_exclude;
  return typeof hlsExclude === "string" && hlsExclude.toLowerCase() === "true";
};

const getFlowAndRelated = async (
  api: ApiClient,
  { type, id }: { type: string; id: Uuid },
) => {
  let flow: Flow | null = null;
  const relatedFlowQueue: Uuid[] = [];

  if (type === "flows") {
    const flowData = (
      await api.get<Flow>(`/flows/${id}?include_timerange=true`)
    ).data;
    if (shouldExcludeFlow(flowData)) {
      console.error("No valid Flows found.");
      return { flow: null, relatedFlows: [] };
    }
    flow = flowData;
  } else {
    const sourceFlows = (await api.get<Flow[]>(`/flows?source_id=${id}`)).data;
    const filteredSourceFlows = sourceFlows.filter(
      (sourceFlow) => !shouldExcludeFlow(sourceFlow),
    );

    if (filteredSourceFlows.length === 0) {
      console.error("No valid Flows found.");
      return { flow: null, relatedFlows: [] };
    }

    flow = (
      await api.get<Flow>(
        `/flows/${filteredSourceFlows[0].id}?include_timerange=true`,
      )
    ).data;
    relatedFlowQueue.push(
      ...filteredSourceFlows.slice(1).map(({ id }: { id: Uuid }) => id),
    );
  }

  if (!flow) {
    return { flow: null, relatedFlows: [] };
  }

  if (flow.flow_collection) {
    relatedFlowQueue.push(
      ...flow.flow_collection.map(({ id }: { id: Uuid }) => id),
    );
  }

  const relatedFlows = await getFlowHierarchy(api, relatedFlowQueue);
  const sortedRelatedFlows = relatedFlows.sort(
    (a, b) => (a.avg_bit_rate || 0) - (b.avg_bit_rate || 0),
  );
  return { flow, relatedFlows: sortedRelatedFlows };
};

const getFlowHierarchy = async (api: ApiClient, relatedFlowQueue: Uuid[]) => {
  const relatedFlows: Flow[] = [];
  const checkedFlowIds: Set<Uuid> = new Set();

  while (relatedFlowQueue.length > 0) {
    const relatedFlowId = relatedFlowQueue.pop();
    if (!relatedFlowId) continue;
    checkedFlowIds.add(relatedFlowId);

    const flowData = (
      await api.get<Flow>(`/flows/${relatedFlowId}?include_timerange=true`)
    ).data;

    if (!shouldExcludeFlow(flowData)) {
      relatedFlows.push(flowData);
    }

    if (flowData.flow_collection) {
      const newFlowIds = flowData.flow_collection
        .filter(({ id }: { id: Uuid }) => !checkedFlowIds.has(id))
        .map(({ id }: { id: Uuid }) => id);

      relatedFlowQueue.push(...newFlowIds);
    }
  }

  return relatedFlows;
};

const getMaxTimerange = (flows: FlowWithParsedTimerange[]) => {
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

const parseAndFilterFlows = (flows: Flow[]) => {
  const result: FlowWithParsedTimerange[] = [];

  for (const flow of flows) {
    // If the flow does not have a container value then it cannot have segments registered
    if (!flow.container) continue;

    try {
      const parsedTimerange = parseTimerange(flow.timerange!);
      if (
        parsedTimerange.start !== undefined &&
        parsedTimerange.end !== undefined
      ) {
        result.push({
          ...flow,
          timerange: parsedTimerange,
        } as FlowWithParsedTimerange);
      }
    } catch {
      // Skip flows with parsing errors
    }
  }

  return result;
};

const getSegmentationTimerange = async (
  flows: FlowWithParsedTimerange[],
  api: ApiClient,
) => {
  // Filter multiflows with container, they must take priority if present
  const multiFlowsWithSegments = flows.filter(
    ({ format, container }) =>
      format === "urn:x-nmos:format:multi" && container,
  );
  // Filter for video flows, Video must take priority if any are present
  const videoFlows = flows.filter(
    ({ format }) => format === "urn:x-nmos:format:video",
  );

  // Determine which flows to use for calculation
  const flowsToUse =
    multiFlowsWithSegments.length > 0
      ? multiFlowsWithSegments
      : videoFlows.length > 0
        ? videoFlows
        : flows;

  if (flowsToUse.length === 0) {
    return {
      timerange: { start: null, end: null },
      flowId: null,
      segments: null,
    };
  }

  // Find the flow with the earliest end time
  const earliestEndFlow = flowsToUse.reduce((earliest, current) =>
    current.timerange.end < earliest.timerange.end ? current : earliest,
  );

  const windowTimerange = {
    includesStart: true,
    start:
      earliestEndFlow.timerange.end -
      BigInt(DEFAULT_SEGMENTATION_DURATION) * NANOS_PER_SECOND,
    end: earliestEndFlow.timerange.end,
    includesEnd: true,
  };

  const windowSegments = await paginationFetcher(
    `/flows/${
      earliestEndFlow.id
    }/segments?presigned=true&limit=300&timerange=${toTimerangeString(windowTimerange)}`,
    api,
  );

  if (windowSegments.length === 0) {
    return {
      timerange: { start: null, end: null },
      flowId: null,
      segments: null,
    };
  }

  if (windowSegments.length === 1) {
    const parsed = parseTimerange(windowSegments[0].timerange);
    return {
      timerange: { start: parsed.start, end: parsed.end },
      flowId: null,
      segments: null,
    };
  }

  return {
    timerange: {
      start: parseTimerange(windowSegments[0].timerange).start!,
      end: parseTimerange(windowSegments[windowSegments.length - 1].timerange)
        .end!,
    },
    flowId: earliestEndFlow.id,
    segments: windowSegments,
  };
};

const getOmakaseData = async (
  api: ApiClient,
  { type, id, timerange }: { type: string; id: Uuid; timerange?: string },
) => {
  const { flow, relatedFlows } = await getFlowAndRelated(api, { type, id });
  const timerangeValidFlows = parseAndFilterFlows(
    [flow, ...relatedFlows].filter((f): f is Flow => f !== null),
  );

  const maxTimerange = getMaxTimerange(timerangeValidFlows);
  const parsedMaxTimerange = toTimerangeString({
    ...maxTimerange,
    includesStart: true,
    includesEnd: true,
  });

  const segmentsCache: Record<string, Segment[]> = {};

  let parsedTimerange: string = timerange || "";
  let segmentationResult: SegmentationResult | null = null;

  if (!timerange) {
    segmentationResult = await getSegmentationTimerange(
      timerangeValidFlows,
      api,
    );
    parsedTimerange = toTimerangeString({
      ...segmentationResult.timerange,
      includesStart: true,
      includesEnd: true,
    });

    // Cache the segments if they were fetched
    if (segmentationResult.flowId && segmentationResult.segments) {
      segmentsCache[segmentationResult.flowId] = segmentationResult.segments;
    }
  }

  const fetchPromises: Promise<[string, Segment[]]>[] = [];
  // Add simple promises for segments already retrieved
  Object.entries(segmentsCache).forEach((entry) =>
    fetchPromises.push(Promise.resolve(entry)),
  );
  if (!flow) throw new Error("Flow should not be null at this point");
  // Add promises for all remaining flow segment requests
  [flow.id, ...relatedFlows.map(({ id }) => id)]
    .filter((id) => !(id in segmentsCache))
    .forEach((id) =>
      fetchPromises.push(
        paginationFetcher(
          `/flows/${id}/segments?presigned=true&limit=300&timerange=${parsedTimerange}`,
          api,
        ).then((result) => [id, result]),
      ),
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
