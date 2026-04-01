import {
  MediaLiveClient,
  StartChannelCommand,
  StopChannelCommand,
  StartChannelCommandInput,
  StopChannelCommandInput,
} from "@aws-sdk/client-medialive";

import { AWS_REGION, AWS_HLS_INGEST_ENDPOINT } from "@/constants";
import useAwsCredentials from "@/hooks/useAwsCredentials";
import useIamApi from "@/hooks/useIamApi";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import type { ChannelIngestion } from "@/types/ingestHls";

export const useChannels = () => {
  const api = useIamApi(AWS_HLS_INGEST_ENDPOINT);
  const { data, mutate, error, isLoading, isValidating } = useSWR<
    ChannelIngestion[]
  >("/channel-ingestion", (path) => api.get(path), {
    refreshInterval: 3000,
  });

  return {
    channels: data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export const useChannelStart = () => {
  const credentials = useAwsCredentials();
  const { trigger, isMutating } = useSWRMutation(
    "/channel-ingestion",
    async (_, { arg }: { arg: StartChannelCommandInput }) => {
      const client = new MediaLiveClient({
        region: AWS_REGION,
        credentials,
      });
      return client.send(new StartChannelCommand(arg));
    },
  );

  return {
    start: trigger,
    isStarting: isMutating,
  };
};

export const useChannelStop = () => {
  const credentials = useAwsCredentials();
  const { trigger, isMutating } = useSWRMutation(
    "/channel-ingestion",
    async (_, { arg }: { arg: StopChannelCommandInput }) => {
      const client = new MediaLiveClient({
        region: AWS_REGION,
        credentials,
      });
      return client.send(new StopChannelCommand(arg));
    },
  );

  return {
    stop: trigger,
    isStopping: isMutating,
  };
};
