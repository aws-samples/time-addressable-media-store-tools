import { useApi } from "@/hooks/useApi";
import useSWR from "swr";
import type { Object } from "@/types/tams";

export const useObjects = (objectId: string) => {
  const { get } = useApi();
  const {
    data: response,
    error,
    isLoading,
  } = useSWR<{ data: Object }>(
    objectId ? ["/objects", objectId] : null,
    ([path, objectId]) => get(`${path}/${objectId}?accept_get_urls=`),
    {
      refreshInterval: 3000,
    },
  );

  return {
    object: response?.data,
    isLoading,
    error,
  };
};
