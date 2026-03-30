import type { Uuid, Flow } from "@/types/tams";

type FetchFlowFn = (id: Uuid) => Promise<Flow | null>;
type FetchFlowsBySourceFn = (sourceId: Uuid) => Promise<Flow[] | null>;

type PropagationResult = {
  flowIds: Set<Uuid>;
  sourceIds: Set<Uuid>;
};

export const collectFlowPropagationEntities = async (
  currentFlow: Flow,
  fetchFlow: FetchFlowFn,
): Promise<PropagationResult> => {
  const flowIds = new Set<Uuid>();
  const sourceIds = new Set<Uuid>(
    currentFlow.source_id ? [currentFlow.source_id] : [],
  );
  await processFlowChildren(currentFlow, flowIds, sourceIds, fetchFlow);
  return { flowIds, sourceIds };
};

export const collectSourcePropagationEntities = async (
  sourceId: Uuid,
  fetchFlow: FetchFlowFn,
  fetchFlowsBySource: FetchFlowsBySourceFn,
): Promise<PropagationResult> => {
  const flowIds = new Set<Uuid>();
  const sourceIds = new Set<Uuid>([sourceId]);
  const flows = await fetchFlowsBySource(sourceId);
  for (const flow of flows || []) {
    flowIds.add(flow.id);
    if (flow.source_id) {
      sourceIds.add(flow.source_id);
    }
    await processFlowChildren(flow, flowIds, sourceIds, fetchFlow);
  }
  return { flowIds, sourceIds };
};

const processFlowChildren = async (
  flow: Flow,
  flowIds: Set<Uuid>,
  sourceIds: Set<Uuid>,
  fetchFlow: FetchFlowFn,
): Promise<void> => {
  if (!flow.flow_collection || !Array.isArray(flow.flow_collection)) {
    return;
  }
  for (const childRef of flow.flow_collection) {
    if (!childRef.id || flowIds.has(childRef.id)) continue;
    flowIds.add(childRef.id);
    const childFlow = await fetchFlow(childRef.id);
    if (childFlow?.source_id) sourceIds.add(childFlow.source_id);
    if (childFlow)
      await processFlowChildren(childFlow, flowIds, sourceIds, fetchFlow);
  }
};
