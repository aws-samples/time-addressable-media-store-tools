import { del, get, put } from "aws-amplify/api";

import { fetchAuthSession } from "aws-amplify/auth";

export const useApi = (apiName = "TAMS") => {
  return {
    get: (path, clientConfig = {}) =>
      fetchAuthSession()
        .then((session) => session.tokens.accessToken.toString())
        .then(
          (accessToken) =>
            get({
              apiName,
              path,
              options: { headers: { Authorization: `Bearer ${accessToken}` } },
              ...clientConfig,
            }).response
        )
        .then((res) => res.body)
        .then((body) => body.json()),
    put: (path, jsonBody, clientConfig = {}) =>
      fetchAuthSession()
        .then((session) => session.tokens.accessToken.toString())
        .then(
          (accessToken) =>
            put({
              apiName,
              path,
              options: {
                headers: { Authorization: `Bearer ${accessToken}` },
                body: jsonBody,
              },
              ...clientConfig,
            }).response
        )
        .then((res) => res.statusCode),
    del: (path, clientConfig = {}) =>
      fetchAuthSession()
        .then((session) => session.tokens.accessToken.toString())
        .then(
          (accessToken) =>
            del({
              apiName,
              path,
              options: {
                headers: { Authorization: `Bearer ${accessToken}` },
              },
              ...clientConfig,
            }).response
        )
        .then((res) => res.statusCode),
  };
};

export const useApiRaw = (apiName = "TAMS") => {
    return {
        get: (path, clientConfig = {}) =>
            fetchAuthSession()
                .then((session) => session.tokens.accessToken.toString())
                .then(
                    (accessToken) =>
                        get({
                            apiName,
                            path,
                            options: { headers: { Authorization: `Bearer ${accessToken}` } },
                            ...clientConfig,
                        }).response
                ),
        put: (path, jsonBody, clientConfig = {}) =>
            fetchAuthSession()
                .then((session) => session.tokens.accessToken.toString())
                .then(
                    (accessToken) =>
                        put({
                            apiName,
                            path,
                            options: {
                                headers: { Authorization: `Bearer ${accessToken}` },
                                body: jsonBody,
                            },
                            ...clientConfig,
                        }).response
                ),
        del: (path, clientConfig = {}) =>
            fetchAuthSession()
                .then((session) => session.tokens.accessToken.toString())
                .then(
                    (accessToken) =>
                        del({
                            apiName,
                            path,
                            options: {
                                headers: { Authorization: `Bearer ${accessToken}` },
                            },
                            ...clientConfig,
                        }).response
                ),
    };
};

export default useApi;
