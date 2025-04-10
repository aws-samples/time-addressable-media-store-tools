import { del, get, put } from "aws-amplify/api";
import { fetchAuthSession } from "aws-amplify/auth";
import parseLinkHeader from "@/utils/parseLinkHeader";

export const useApi = (apiName = "TAMS") => {
  const getAuthToken = async () => {
    const session = await fetchAuthSession();
    return session.tokens.accessToken.toString();
  };

  const makeRequest = async (method, path, options = {}) => {
    const accessToken = await getAuthToken();
    const commonOptions = {
      apiName,
      path,
      options: {
        headers: { Authorization: `Bearer ${accessToken}` },
        ...options,
      },
    };
    const response = await method(commonOptions).response;
    const links = parseLinkHeader(response.headers.link);
    const enhancedResponse = {
      data: method === get ? await response.body.json() : response.statusCode,
      headers: response.headers,
      nextLink: links.next,
    };
    return enhancedResponse;
  };

  return {
    get: (path, clientConfig = {}) =>
      makeRequest(get, path, { ...clientConfig }),
    put: (path, jsonBody, clientConfig = {}) =>
      makeRequest(put, path, {
        ...clientConfig,
        body: jsonBody,
      }),
    del: (path, clientConfig = {}) =>
      makeRequest(del, path, { ...clientConfig }),
  };
};

export default useApi;
