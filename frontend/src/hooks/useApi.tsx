import { useAuth } from "react-oidc-context";
import { useMemo } from "react";
import parseLinkHeader from "@/utils/parseLinkHeader";
import { AWS_TAMS_ENDPOINT } from "@/constants";
import type { RequestOptions } from "@/types/hooks";

type ApiResponse = {
  data: any;
  headers: Record<string, string>;
  nextLink?: string;
};

export const useApi = () => {
  const auth = useAuth();

  return useMemo(() => {
    const makeRequest = async (method: string, path: string, options: RequestOptions = {}): Promise<ApiResponse> => {
      const accessToken = auth.user?.access_token;

      const response = await fetch(`${AWS_TAMS_ENDPOINT}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
        body: options.body != null ? JSON.stringify(options.body) : undefined,
      });

      const links = parseLinkHeader(response.headers.get("link") || undefined);

      return {
        data: await response.json().catch(() => ({})),
        headers: Object.fromEntries(response.headers.entries()),
        nextLink: links.next,
      };
    };

    return {
      get: (path: string, options: RequestOptions = {}) => makeRequest("GET", path, options),
      put: (path: string, jsonBody: any, options: RequestOptions = {}) =>
        makeRequest("PUT", path, { ...options, body: jsonBody }),
      del: (path: string, options: RequestOptions = {}) => makeRequest("DELETE", path, options),
    };
  }, [auth.user?.access_token]);
};
