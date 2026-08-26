import { useApi } from "@/hooks/useApi";
import useSWR from "swr";
import paginationFetcher from "@/utils/paginationFetcher";
import { TAMS_PAGE_LIMIT, TAMS_POLLING_INTERVAL } from "@/constants";
import type { Uuid, Profile } from "@/types/tams";

export const useProfiles = () => {
  const api = useApi();
  const { data, mutate, error, isLoading, isValidating } = useSWR<Profile[]>(
    `/service/profiles?limit=${TAMS_PAGE_LIMIT}`,
    (path) => paginationFetcher(path, api),
    {
      refreshInterval: TAMS_POLLING_INTERVAL,
    },
  );

  return {
    profiles: data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export const useProfile = (profileId: Uuid) => {
  const { get } = useApi();
  const {
    data: response,
    mutate,
    error,
    isLoading,
    isValidating,
  } = useSWR<{
    data: Profile;
    headers: Record<string, string>;
    nextLink?: string;
  }>(["/service/profiles", profileId], ([path, profileId]) => get(`${path}/${profileId}`));

  return {
    profile: response?.data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};
