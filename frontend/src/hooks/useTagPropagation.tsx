import { useBulkUpdate, useBulkDelete } from "@/hooks/useTags";
import { useApi } from "@/hooks/useApi";
import {
  collectFlowPropagationEntities,
  collectSourcePropagationEntities,
} from "@/utils/tagPropagation";
import type { Uuid, Flow, Source, TagName, TagValue } from "@/types/tams";

export const useTagPropagation = () => {
  const { bulkUpdate: bulkUpdateFlows } = useBulkUpdate("flows");
  const { bulkUpdate: bulkUpdateSources } = useBulkUpdate("sources");
  const { bulkDelete: bulkDeleteFlows } = useBulkDelete("flows");
  const { bulkDelete: bulkDeleteSources } = useBulkDelete("sources");
  const { get } = useApi();

  const createApiFunctions = () => ({
    fetchFlow: async (flowId: Uuid) => {
      const response = await get<Flow | null>(`/flows/${flowId}?include_timerange=true`);
      return response.data;
    },
    fetchFlowsBySource: async (sourceId: Uuid) => {
      const response = await get<Flow[]>(`/flows?source_id=${sourceId}`);
      return response.data;
    },
  });

  const propagateTagAction = async (
    entityType: string,
    entity: Flow | Source,
    action: "update" | "delete",
    tagName: TagName,
    tagValue?: TagValue,
  ) => {
    const { fetchFlow, fetchFlowsBySource } = createApiFunctions();

    const entities =
      entityType === "flows"
        ? await collectFlowPropagationEntities(entity as Flow, fetchFlow)
        : await collectSourcePropagationEntities(
          entity.id,
          fetchFlow,
          fetchFlowsBySource,
        );

    let promises;

    const entityIds = [
      { ids: entities.flowIds, type: "flows" as const },
      { ids: entities.sourceIds, type: "sources" as const },
    ];

    switch (action) {
      case "update": {
        const updateFns = {
          flows: bulkUpdateFlows,
          sources: bulkUpdateSources,
        };
        const entityGroups = entityIds.map((group) => ({
          ids: group.ids,
          bulkFn: updateFns[group.type],
        }));
        promises = entityGroups
          .filter((group) => group.ids.size > 0)
          .map(async (group) => {
            try {
              await group.bulkFn({
                entityIds: Array.from(group.ids),
                tagName,
                tagValue: tagValue!,
              });
            } catch (error) {
              console.error(error);
            }
          });
        break;
      }
      case "delete": {
        const deleteFns = {
          flows: bulkDeleteFlows,
          sources: bulkDeleteSources,
        };
        const entityGroups = entityIds.map((group) => ({
          ids: group.ids,
          bulkFn: deleteFns[group.type],
        }));
        promises = entityGroups
          .filter((group) => group.ids.size > 0)
          .map(async (group) => {
            try {
              await group.bulkFn({
                entityIds: Array.from(group.ids),
                tagName,
              });
            } catch (error) {
              console.error(error);
            }
          });
        break;
      }
      default: {
        const exhaustiveCheck: never = action;
        throw new Error(`Unhandled action: ${exhaustiveCheck}`);
      }
    }

    await Promise.all(promises);
  };

  return { propagateTagAction };
};
