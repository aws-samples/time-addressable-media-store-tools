import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import {
  AWS_REGION,
  AWS_FFMPEG_BATCH_ARN,
  AWS_FFMPEG_EXPORT_ARN,
  AWS_FFMPEG_ENDPOINT,
} from "@/constants";
import useAwsCredentials from "@/hooks/useAwsCredentials";
import useIamApi from "@/hooks/useIamApi";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import type { Uuid, Timerange } from "@/types/tams";
import type {
  FfmpegConfig,
  FfmpegExport,
  JobTarget,
  RuleTarget,
} from "@/types/ingestFFmpeg";

type DeleteRuleArgs = {
  flowId: Uuid;
  outputFlowId: Uuid;
};

type CreateRuleArgs = {
  flowId: Uuid;
  outputFlowId: Uuid;
  payload: FfmpegConfig | undefined;
};

type JobStartArgs = {
  inputFlow: Uuid;
  timerange: Timerange;
  ffmpeg: FfmpegConfig;
  outputFlow: Uuid;
};

type ExportStartArgs = {
  timerange: Timerange;
  flowIds: Uuid[];
  ffmpeg: FfmpegConfig;
};

const hierachyFetcher = async <T extends JobTarget | RuleTarget>(
  api: ReturnType<typeof useIamApi>,
  path: string,
) => {
  const data: { id: string; targets: T[] }[] = await api.get(path);
  return [
    ...data.map(({ id }) => ({ key: id, id, parentId: null })),
    ...data.flatMap(({ id, targets }) =>
      targets.map((target) => ({
        key: target.executionArn ?? `${id}_${target.outputFlow}`,
        parentId: id,
        ...target,
      })),
    ),
  ];
};

export const useRules = () => {
  const api = useIamApi(AWS_FFMPEG_ENDPOINT);
  const { data, mutate, error, isLoading, isValidating } = useSWR(
    "/ffmpeg-rules",
    (path) => hierachyFetcher<RuleTarget>(api, path),
    {
      refreshInterval: 3000,
    },
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
  const api = useIamApi(AWS_FFMPEG_ENDPOINT);
  const { trigger, isMutating } = useSWRMutation(
    "/ffmpeg-rules",
    async (path, { arg }: { arg: CreateRuleArgs }) => {
      await api.put(`${path}/${arg.flowId}/${arg.outputFlowId}`, arg.payload);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // setTimeout used to artificially wait until basic puts are complete.
    },
  );

  return {
    put: trigger,
    isPutting: isMutating,
  };
};

export const useDeleteRule = () => {
  const api = useIamApi(AWS_FFMPEG_ENDPOINT);
  const { trigger, isMutating } = useSWRMutation(
    "/ffmpeg-rules",
    async (path, { arg }: { arg: DeleteRuleArgs }) => {
      await api.del(`${path}/${arg.flowId}/${arg.outputFlowId}`);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // setTimeout used to artificially wait until basic deletes are complete.
    },
  );

  return {
    del: trigger,
    isDeleting: isMutating,
  };
};

export const useJobStart = () => {
  const credentials = useAwsCredentials();
  const { trigger, isMutating } = useSWRMutation(
    "/ffmpeg-jobs",
    async (_, { arg }: { arg: JobStartArgs }) => {
      const client = new SFNClient({
        region: AWS_REGION,
        credentials,
      });
      return client.send(
        new StartExecutionCommand({
          stateMachineArn: AWS_FFMPEG_BATCH_ARN,
          input: JSON.stringify(arg),
        }),
      );
    },
  );

  return {
    start: trigger,
    isStarting: isMutating,
  };
};

export const useJobs = () => {
  const api = useIamApi(AWS_FFMPEG_ENDPOINT);
  const { data, mutate, error, isLoading, isValidating } = useSWR(
    "/ffmpeg-jobs",
    (path) => hierachyFetcher<JobTarget>(api, path),
    {
      refreshInterval: 3000,
    },
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
  const api = useIamApi(AWS_FFMPEG_ENDPOINT);
  const { data, mutate, error, isLoading, isValidating } = useSWR<
    FfmpegExport[]
  >("/ffmpeg-exports", (path) => api.get(path), {
    refreshInterval: 3000,
  });

  return {
    exports: data,
    mutate,
    isLoading,
    isValidating,
    error,
  };
};

export const useExportStart = () => {
  const credentials = useAwsCredentials();
  const { trigger, isMutating } = useSWRMutation(
    "/ffmpeg-exports",
    async (_, { arg }: { arg: ExportStartArgs }) => {
      const client = new SFNClient({
        region: AWS_REGION,
        credentials,
      });
      return client.send(
        new StartExecutionCommand({
          stateMachineArn: AWS_FFMPEG_EXPORT_ARN,
          input: JSON.stringify(arg),
        }),
      );
    },
  );

  return {
    start: trigger,
    isStarting: isMutating,
  };
};
