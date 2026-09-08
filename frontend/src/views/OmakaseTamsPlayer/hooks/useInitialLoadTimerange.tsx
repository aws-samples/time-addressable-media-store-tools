import useSWR from "swr";
import { useApi } from "@/hooks/useApi";
import { INITIAL_LOAD_MAX_SECONDS } from "../constants";
import { capTimerange, computeMaxTimerangeFromFlows } from "../utils";
import type { Flow } from "@/types/tams";

/**
 * Resolves the bounded timerange to open a TAMS resource with.
 *
 * omakase-player 1.x has no "load the last N seconds" option — a bare `duration` means CONTINUOUS
 * live playback and TAMS timeranges are absolute — so the resource's own timerange has to be read
 * before the media loads, then clamped. Without this the player pages every segment of the flow,
 * which is unusable on long flows.
 *
 * Deliberately a one-shot read: revalidation is off so the resolved value is stable for the
 * lifetime of the route and cannot retrigger player construction.
 */
export const useInitialLoadTimerange = (
  type: string | undefined,
  id: string | undefined,
) => {
  const { get } = useApi();

  const { data, error, isLoading } = useSWR(
    type && id ? ["initial-load-timerange", type, id] : null,
    async ([, resourceType, resourceId]) => {
      if (resourceType === "sources") {
        // A source has no timerange of its own — take the union across its flows, which is the
        // same window the time-range selector will report as the maximum.
        const flows = await get<Flow[]>(`/flows?source_id=${resourceId}`);
        return computeMaxTimerangeFromFlows(flows.data);
      }
      const flow = await get<Flow>(
        `/${resourceType}/${resourceId}?include_timerange=true`,
      );
      return flow.data.timerange ?? null;
    },
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
      revalidateOnReconnect: false,
      refreshInterval: 0,
    },
  );

  return {
    // null (resource has no resolvable timerange) falls back to the library's default VOD window.
    timerange: data ? capTimerange(data, INITIAL_LOAD_MAX_SECONDS) : null,
    isResolved: !isLoading && (data !== undefined || !!error),
    error,
  };
};
