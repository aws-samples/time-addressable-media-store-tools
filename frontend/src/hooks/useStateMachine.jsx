import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";

import { AWS_REGION } from "@/constants";
import { fetchAuthSession } from "aws-amplify/auth";
import { get } from "aws-amplify/api";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";

const fetcher = async (path) =>
  get({ apiName: "HlsIngest", path })
    .response.then((res) => res.body)
    .then((body) => body.json());

export const useWorkflows = () => {
  const { data, mutate, error, isLoading, isValidating } = useSWR(
    "/workflows",
    fetcher,
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
  const { trigger, isMutating } = useSWRMutation(
    "/hls-ingestion",
    (_, { arg }) =>
      fetchAuthSession().then((session) =>
        new SFNClient({
          region: AWS_REGION,
          credentials: session.credentials,
        })
          .send(new StartExecutionCommand(arg))
          .then((response) => response)
      )
  );

  return {
    execute: trigger,
    isExecuting: isMutating,
  };
};
