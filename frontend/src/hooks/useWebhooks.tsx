import { useApi } from "@/hooks/useApi";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import paginationFetcher from "@/utils/paginationFetcher";
import { TAMS_PAGE_LIMIT, TAMS_POLLING_INTERVAL } from "@/constants";
import type { Uuid, WebhookGet, WebhookPost, WebhookPut } from "@/types/tams";

type DeleteArg = {
  webhookId: Uuid;
};

export const useWebhooks = () => {
  const api = useApi();
  const { data, mutate, error, isLoading, isValidating } = useSWR<WebhookGet[]>(
    `/service/webhooks?limit=${TAMS_PAGE_LIMIT}`,
    (path) => paginationFetcher(path, api),
    {
      refreshInterval: TAMS_POLLING_INTERVAL,
    },
  );

  return {
    webhooks: data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export const useWebhook = (webhookId: Uuid) => {
  const { get } = useApi();
  const {
    data: response,
    mutate,
    error,
    isLoading,
    isValidating,
  } = useSWR<{
    data: WebhookGet;
    headers: Record<string, string>;
    nextLink?: string;
  }>(
    ["/service/webhooks", webhookId],
    ([path, webhookId]) => get(`${path}/${webhookId}`),
    {
      refreshInterval: TAMS_POLLING_INTERVAL,
    },
  );

  return {
    webhook: response?.data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export const useDelete = () => {
  const { del } = useApi();
  const { trigger, isMutating } = useSWRMutation(
    "/service/webhooks",
    (path, { arg }: { arg: DeleteArg }) =>
      del(`${path}/${arg.webhookId}`).then(
        (response) =>
          new Promise((resolve) =>
            setTimeout(() => resolve(response.data), 1000),
          ),
      ), // setTimeout used to artificially wait until basic deletes are complete.
  );

  return {
    del: trigger,
    isDeleting: isMutating,
  };
};

export const useRegister = () => {
  const { post } = useApi();
  const { trigger, isMutating } = useSWRMutation(
    "/service/webhooks",
    (path, { arg }: { arg: WebhookPost }) =>
      post(path, arg).then((response) => response.data),
  );

  return {
    register: trigger,
    isRegistering: isMutating,
  };
};

export const useUpdate = () => {
  const { put } = useApi();
  const { trigger, isMutating } = useSWRMutation(
    "/service/webhooks",
    (path, { arg }: { arg: WebhookPut }) =>
      put(`${path}/${arg.id}`, arg).then((response) => response.data),
  );

  return {
    update: trigger,
    isUpdating: isMutating,
  };
};
