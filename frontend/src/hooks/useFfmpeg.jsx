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

const hierachyFetcher = async (api, path) => {
  const data = await api.get(path);
  return [
    ...data.map(({ id }) => ({ key: id, id, parentId: null })),
    ...data.flatMap(({ id, targets }) =>
      targets.map((target) => ({
        key: target.executionArn ?? `${id}_${target.outputFlow}`,
        parentId: id,
        ...target,
      }))
    ),
  ];
};

export const useRules = () => {
  const api = useIamApi(AWS_FFMPEG_ENDPOINT);
  const { data, mutate, error, isLoading, isValidating } = useSWR(
    "/ffmpeg-rules",
    (path) => hierachyFetcher(api, path),
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
  const api = useIamApi(AWS_FFMPEG_ENDPOINT);
  const { trigger, isMutating } = useSWRMutation(
    "/ffmpeg-rules",
    async (path, { arg }) => {
      await api.put(`${path}/${arg.flowId}/${arg.outputFlowId}`, arg.payload);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // setTimeout used to artificially wait until basic puts are complete.
    }
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
    async (path, { arg }) => {
      await api.del(`${path}/${arg.flowId}/${arg.outputFlowId}`);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // setTimeout used to artificially wait until basic deletes are complete.
    }
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
    async (_, { arg }) => {
      const client = new SFNClient({
        region: AWS_REGION,
        credentials,
      });
      return client.send(
        new StartExecutionCommand({
          stateMachineArn: AWS_FFMPEG_BATCH_ARN,
          input: JSON.stringify(arg),
        })
      );
    }
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
    (path) => hierachyFetcher(api, path),
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
  const api = useIamApi(AWS_FFMPEG_ENDPOINT);
  const { data, mutate, error, isLoading, isValidating } = useSWR(
    "/ffmpeg-exports",
    (path) => api.get(path),
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
  const credentials = useAwsCredentials();
  const { trigger, isMutating } = useSWRMutation(
    "/ffmpeg-exports",
    async (_, { arg }) => {
      const client = new SFNClient({
        region: AWS_REGION,
        credentials,
      });
      return client.send(
        new StartExecutionCommand({
          stateMachineArn: AWS_FFMPEG_EXPORT_ARN,
          input: JSON.stringify(arg),
        })
      );
    }
  );

  return {
    start: trigger,
    isStarting: isMutating,
  };
};
