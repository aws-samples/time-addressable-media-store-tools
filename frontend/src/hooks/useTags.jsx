import { useApi } from "@/hooks/useApi";
import useSWRMutation from "swr/mutation";

export const useUpdate = (entityType, id) => {
  const { put } = useApi();
  const { trigger, isMutating } = useSWRMutation(
    [`/${entityType}`, id],
    ([path, id], { arg }) =>
      put(`${path}/${id}/tags/${arg.name}`, arg.value)
  );

  return {
    update: trigger,
    isUpdating: isMutating,
  };
};

export const useDelete = (entityType, id) => {
  const { del } = useApi();
  const { trigger, isMutating } = useSWRMutation(
    [`/${entityType}`, id],
    ([path, id], { arg }) => del(`${path}/${id}/tags/${arg.name}`)
  );

  return {
    del: trigger,
    isDeleting: isMutating,
  };
};
