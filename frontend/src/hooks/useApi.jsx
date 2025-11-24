import { useAuth } from "react-oidc-context";
import { useMemo } from "react";
import parseLinkHeader from "@/utils/parseLinkHeader";
import { AWS_TAMS_ENDPOINT } from "@/constants";

export const useApi = () => {
  const auth = useAuth();

  return useMemo(() => {
    const makeRequest = async (method, path, options = {}) => {
      const accessToken = auth.user?.access_token;

      const response = await fetch(`${AWS_TAMS_ENDPOINT}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      const links = parseLinkHeader(response.headers.get("link"));

      return {
        data: method === "GET" ? await response.json() : response.status,
        headers: Object.fromEntries(response.headers.entries()),
        nextLink: links.next,
      };
    };

    return {
      get: (path, options = {}) => makeRequest("GET", path, options),
      put: (path, jsonBody, options = {}) =>
        makeRequest("PUT", path, { ...options, body: jsonBody }),
      del: (path, options = {}) => makeRequest("DELETE", path, options),
    };
  }, [auth.user?.access_token]);
};
