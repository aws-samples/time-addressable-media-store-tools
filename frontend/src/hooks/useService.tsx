import { useApi } from "@/hooks/useApi";
import useSWR from "swr";
import type { Service } from "@/types/tams";

export const useService = () => {
  const { get } = useApi();
  const { data: response, error, isLoading } = useSWR<{
    data: Service;
  }>("/service", (path: string) => get<Service>(path));

  return { service: response?.data, isLoading, error };
};
