import { get, del, put } from "aws-amplify/api";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import {
  AWS_REGION,
  AWS_FFMPEG_BATCH_ARN,
  AWS_FFMPEG_EXPORT_ARN,
} from "@/constants";
import { fetchAuthSession } from "aws-amplify/auth";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";

const fetcher = async (path) =>
  get({ apiName: "Ffmpeg", path })
    .response.then((res) => res.body)
    .then((body) => body.json());

const hierachyFetcher = async (path) =>
  get({ apiName: "Ffmpeg", path })
    .response.then((res) => res.body)
    .then((body) => body.json())
    .then((data) => [
      ...data.map(({ id }) => ({ key: id, id, parentId: null })),
      ...data.flatMap(({ id, targets }) =>
        targets.map((target) => ({
          key: target.executionArn ?? `${id}_${target.outputFlow}`,
          parentId: id,
          ...target,
        }))
      ),
    ]);

export const useRules = () => {
  const { data, mutate, error, isLoading, isValidating } = useSWR(
    "/ffmpeg-rules",
    hierachyFetcher,
    {
      refreshInterval: 3000,
    }
  );

  return {
    rules: data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export const useCreateRule = () => {
  const { trigger, isMutating } = useSWRMutation(
    "/ffmpeg-rules",
    (path, { arg }) =>
      put({
        apiName: "Ffmpeg",
        path: `${path}/${arg.flowId}/${arg.outputFlowId}`,
        options: {
          body: arg.payload,
        },
      })
        .response.then((res) => res.statusCode)
        .then((response) => setTimeout(response, 1000)) // setTimeout used to artificially wait until basic puts are complete.
  );

  return {
    put: trigger,
    isPutting: isMutating,
  };
};

export const useDeleteRule = () => {
  const { trigger, isMutating } = useSWRMutation(
    "/ffmpeg-rules",
    (path, { arg }) =>
      del({
        apiName: "Ffmpeg",
        path: `${path}/${arg.flowId}/${arg.outputFlowId}`,
      })
        .response.then((res) => res.statusCode)
        .then((response) => setTimeout(response, 1000)) // setTimeout used to artificially wait until basic deletes are complete.
  );

  return {
    del: trigger,
    isDeleting: isMutating,
  };
};

export const useJobStart = () => {
  const { trigger, isMutating } = useSWRMutation("/ffmpeg-jobs", (_, { arg }) =>
    fetchAuthSession().then((session) =>
      new SFNClient({
        region: AWS_REGION,
        credentials: session.credentials,
      })
        .send(
          new StartExecutionCommand({
            stateMachineArn: AWS_FFMPEG_BATCH_ARN,
            input: JSON.stringify(arg),
          })
        )
        .then((response) => response)
    )
  );

  return {
    start: trigger,
    isStarting: isMutating,
  };
};

export const useJobs = () => {
  const { data, mutate, error, isLoading, isValidating } = useSWR(
    "/ffmpeg-jobs",
    hierachyFetcher,
    {
      refreshInterval: 3000,
    }
  );

  return {
    jobs: data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export const useExports = () => {
  const { data, mutate, error, isLoading, isValidating } = useSWR(
    "/ffmpeg-exports",
    fetcher,
    {
      refreshInterval: 3000,
    }
  );

  return {
    exports: data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export const useExportStart = () => {
  const { trigger, isMutating } = useSWRMutation(
    "/ffmpeg-exports",
    (_, { arg }) =>
      fetchAuthSession().then((session) =>
        new SFNClient({
          region: AWS_REGION,
          credentials: session.credentials,
        })
          .send(
            new StartExecutionCommand({
              stateMachineArn: AWS_FFMPEG_EXPORT_ARN,
              input: JSON.stringify(arg),
            })
          )
          .then((response) => response)
      )
  );

  return {
    start: trigger,
    isStarting: isMutating,
  };
};
