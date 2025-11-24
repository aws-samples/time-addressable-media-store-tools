import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";

import { AWS_REGION } from "@/constants";
import useAwsCredentials from "@/hooks/useAwsCredentials";
import useIamApi from "@/hooks/useIamApi";
import { AWS_HLS_INGEST_ENDPOINT } from "@/constants";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";

export const useWorkflows = () => {
  const api = useIamApi(AWS_HLS_INGEST_ENDPOINT);
  const { data, mutate, error, isLoading, isValidating } = useSWR(
    "/workflows",
    (path) => api.get(path),
    {
      refreshInterval: 3000,
    }
  );

  return {
    workflows: data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export const useStateMachine = () => {
  const credentials = useAwsCredentials();
  const { trigger, isMutating } = useSWRMutation(
    "/hls-ingestion",
    async (_, { arg }) => {
      const client = new SFNClient({
        region: AWS_REGION,
        credentials,
      });
      return client.send(new StartExecutionCommand(arg));
    }
  );

  return {
    execute: trigger,
    isExecuting: isMutating,
  };
};
