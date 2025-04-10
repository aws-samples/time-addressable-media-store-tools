import { useApi } from "@/hooks/useApi";

const applyChanges = (flow, changes, sourceId) => {
  const newFlow = {
    ...flow,
    id: crypto.randomUUID(),
    source_id: sourceId,
  };
  Object.entries(changes).forEach(([key, value]) => {
    if (value === null) {
      const pathParts = key.split(".");
      let current = newFlow;
      for (let i = 0; i < pathParts.length - 1; i++) {
        current = current[pathParts[i]];
      }
      delete current[pathParts[pathParts.length - 1]];
    } else {
      if (key.includes(".")) {
        const pathParts = key.split(".");
        let current = newFlow;
        for (let i = 0; i < pathParts.length - 1; i++) {
          current = current[pathParts[i]] = current[pathParts[i]] || {};
        }
        current[pathParts[pathParts.length - 1]] = value;
      } else {
        newFlow[key] = value;
      }
    }
  });
  return newFlow;
};

const createFFmegFlow = async (flowId, changes) => {
  const { get, put } = useApi();
  const { data: flow } = await get(`/flows/${flowId}`);
  let newSourceId = changes.format ? crypto.randomUUID() : flow.source_id;
  const flowCollectionsMap = new Map();
  if (flow.collected_by) {
    await Promise.all(
      flow.collected_by.map(async (collectedById) => {
        const { data: flowCollection } = await get(
          `/flows/${collectedById}/flow_collection`
        );
        flowCollectionsMap.set(collectedById, flowCollection);
      })
    );
  }
  if (flow.collected_by && changes.format) {
    const formatSources = await Promise.all(
      flow.collected_by.map(async (collectedById) => {
        const flowCollection = flowCollectionsMap.get(collectedById);
        return await Promise.all(
          flowCollection.map(async ({ id }) => {
            const { data: collectedFlow } = await get(`/flows/${id}`);
            return collectedFlow.format === changes.format
              ? collectedFlow.source_id
              : null;
          })
        );
      })
    ).then((results) => results.flat());
    newSourceId = formatSources.find((sourceId) => sourceId) ?? newSourceId;
  }
  const newFlow = applyChanges(flow, changes, newSourceId);
  delete newFlow.created_by;
  delete newFlow.updated_by;
  await put(`/flows/${newFlow.id}`, newFlow);
  flow.collected_by.forEach(async (collectedById) => {
    const flowCollection = flowCollectionsMap.get(collectedById);
    await put(`/flows/${collectedById}/flow_collection`, [
      ...flowCollection,
      { id: newFlow.id, role: newFlow.format.split(":")[3] },
    ]);
  });
  return newFlow.id;
};

export default createFFmegFlow;
