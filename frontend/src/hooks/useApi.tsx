import { useAuth } from "react-oidc-context";
import { useMemo } from "react";
import parseLinkHeader from "@/utils/parseLinkHeader";
import useAlertsStore from "@/stores/useAlertsStore";
import { AWS_TAMS_ENDPOINT } from "@/constants";
import type { RequestOptions } from "@/types/hooks";

type ApiResponse<T = unknown> = {
  data: T;
  headers: Record<string, string>;
  nextLink?: string;
};

export const useApi = () => {
  const auth = useAuth();
  const addAlertItem = useAlertsStore((state) => state.addAlertItem);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);

  return useMemo(() => {
    const makeRequest = async <T = unknown,>(
      method: string,
      path: string,
      options: RequestOptions = {},
    ): Promise<ApiResponse<T>> => {
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

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        let errorMessage = "";
        if (Array.isArray(errorData.message)) {
          // Pydantic validation errors
          errorMessage = errorData.message
            .map((err: { loc?: (string | number)[]; msg: string }) => {
              const field = err.loc?.slice(1).join(".") || "unknown field";
              return `${field}: ${err.msg}`;
            })
            .join("; ");
        } else {
          errorMessage =
            errorData.message ||
            errorData.detail ||
            errorData.error ||
            JSON.stringify(errorData);
        }
        const fullMessage = `HTTP ${response.status}: ${errorMessage}`;
        const alertId = `api-error-${Date.now()}-${Math.random()}`;
        addAlertItem({
          type: "error",
          dismissible: true,
          dismissLabel: "Dismiss message",
          content: `${method} ${path} failed — ${fullMessage}`,
          id: alertId,
          onDismiss: () => delAlertItem(alertId),
        });
        throw new Error(fullMessage);
      }

      return {
        data: await response.json().catch(() => ({})),
        headers: Object.fromEntries(response.headers.entries()),
        nextLink: links.next,
      };
    };

    return {
      get: <T = unknown,>(path: string, options: RequestOptions = {}) =>
        makeRequest<T>("GET", path, options),
      put: (path: string, jsonBody: unknown, options: RequestOptions = {}) =>
        makeRequest("PUT", path, { ...options, body: jsonBody }),
      del: (path: string, options: RequestOptions = {}) =>
        makeRequest("DELETE", path, options),
      post: (path: string, jsonBody: unknown, options: RequestOptions = {}) =>
        makeRequest("POST", path, { ...options, body: jsonBody }),
    };
  }, [auth.user?.access_token, addAlertItem, delAlertItem]);
};
