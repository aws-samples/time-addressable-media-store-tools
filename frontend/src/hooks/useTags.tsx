import { useApi } from "@/hooks/useApi";
import useSWRMutation from "swr/mutation";
import type { Uuid, TagName, TagValue } from "@/types/tams";

type UpdateArg = {
  name: TagName;
  value: TagValue;
};

type DeleteArg = {
  name: TagName;
};

type BulkUpdateArg = {
  entityIds: Uuid[];
  tagName: TagName;
  tagValue: TagValue;
};

type BulkDeleteArg = {
  entityIds: Uuid[];
  tagName: TagName;
};

export const useUpdate = (entityType: string, id: Uuid) => {
  const { put } = useApi();
  const { trigger, isMutating } = useSWRMutation(
    [`/${entityType}`, id],
    ([path, id], { arg }: { arg: UpdateArg }) =>
      put(`${path}/${id}/tags/${arg.name}`, arg.value).then(
        (response) => response.data,
      ),
  );

  return {
    update: trigger,
    isUpdating: isMutating,
  };
};

export const useDelete = (entityType: string, id: Uuid) => {
  const { del } = useApi();
  const { trigger, isMutating } = useSWRMutation(
    [`/${entityType}`, id],
    ([path, id], { arg }: { arg: DeleteArg }) =>
      del(`${path}/${id}/tags/${arg.name}`).then((response) => response.data),
  );

  return {
    del: trigger,
    isDeleting: isMutating,
  };
};

export const useBulkUpdate = (entityType: string) => {
  const { put } = useApi();
  const { trigger, isMutating } = useSWRMutation(
    [`/tags/bulk-update`, entityType],
    ([, entityType], { arg }: { arg: BulkUpdateArg }) => {
      const promises = arg.entityIds.map((entityId) =>
        put(
          `/${entityType}/${entityId}/tags/${arg.tagName}`,
          arg.tagValue,
        ).then((response) => response.data),
      );

      return Promise.all(promises);
    },
  );

  return {
    bulkUpdate: trigger,
    isBulkUpdating: isMutating,
  };
};

export const useBulkDelete = (entityType: string) => {
  const { del } = useApi();
  const { trigger, isMutating } = useSWRMutation(
    [`/tags/bulk-delete`, entityType],
    ([, entityType], { arg }: { arg: BulkDeleteArg }) => {
      const promises = arg.entityIds.map((entityId) =>
        del(`/${entityType}/${entityId}/tags/${arg.tagName}`).then(
          (response) => response.data,
        ),
      );

      return Promise.all(promises);
    },
  );

  return {
    bulkDelete: trigger,
    isBulkDeleting: isMutating,
  };
};
