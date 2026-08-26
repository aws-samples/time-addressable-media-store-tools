import { useApi } from "@/hooks/useApi";
import useSWR from "swr";

/**
 * Whether the connected TAMS store exposes `path`.
 * true = available, false = absent (404), undefined = still checking.
 * Uses a silent HEAD so a missing endpoint raises no user-facing alert.
 */
export const useCapability = (path: string) => {
  const { head } = useApi();
  const { data } = useSWR(
    ["capability", path],
    async () => {
      try {
        await head(path, { silent: true });
        return true;
      } catch (error) {
        // Only a 404 means the endpoint isn't implemented. 405 (HEAD unsupported),
        // transient auth/5xx, etc. → assume the endpoint exists.
        return (error as { status?: number }).status !== 404;
      }
    },
    // Capability is static per store, so probe once per session.
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );
  return data;
};
