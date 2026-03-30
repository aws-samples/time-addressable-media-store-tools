import { useApi } from "@/hooks/useApi";
import useSWRMutation from "swr/mutation";
import type { Uuid } from "@/types/tams";

type UpdateArg = {
  field: string;
  value: any;
};

export const useUpdateField = (entityType: string, id: Uuid) => {
  const { put } = useApi();
  const { trigger, isMutating } = useSWRMutation(
    [`/${entityType}`, id],
    ([path, id], { arg }: { arg: UpdateArg }) =>
      put(`${path}/${id}/${arg.field}`, arg.value).then(
        (response) => response.data
      )
  );

  return {
    update: trigger,
    isUpdating: isMutating,
  };
};
