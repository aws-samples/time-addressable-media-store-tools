import {
  MediaConvertClient,
  CreateJobCommand,
  paginateListJobs,
} from "@aws-sdk/client-mediaconvert";
import { AWS_REGION, MEDIACONVERT_BUCKET } from "@/constants";
import useAwsCredentials from "@/hooks/useAwsCredentials";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import {
  AWS_TAMS_ENDPOINT,
  TAMS_AUTH_CONNECTION_ARN,
  TAMS_POLLING_INTERVAL,
} from "@/constants";
import type { Job } from "@aws-sdk/client-mediaconvert";
import type { CognitoIdentityCredentialProvider } from "@aws-sdk/credential-providers";
import type { Uuid } from "@/types/tams";

type CreateJobSpecParams = {
  spec: string;
  sourceId: Uuid;
  fileName: string;
  timeranges: string;
};

const isTamsJob = (job: Job) => {
  return job.Settings?.Inputs?.some((input) => input.TamsSettings);
};

const mediaConvertFetcher = async (
  credentials: CognitoIdentityCredentialProvider,
) => {
  const client = new MediaConvertClient({
    region: AWS_REGION,
    credentials,
  });
  const allJobs: Job[] = [];
  for await (const page of paginateListJobs({ client }, {})) {
    allJobs.push(...(page.Jobs ?? []));
  }
  return allJobs.filter(isTamsJob);
};

export const useTamsJobs = () => {
  const credentials = useAwsCredentials();
  const { data, mutate, error, isLoading } = useSWR(
    "mediaconvert-jobs",
    () => mediaConvertFetcher(credentials),
    {
      refreshInterval: TAMS_POLLING_INTERVAL,
    },
  );

  return {
    jobs: data,
    mutate,
    isLoading,
    error,
  };
};

const createFinalJobSpec = ({
  spec,
  sourceId,
  fileName,
  timeranges,
}: CreateJobSpecParams) => {
  const parsedJobSpec = JSON.parse(spec);
  parsedJobSpec.Settings.OutputGroups[0] = {
    ...parsedJobSpec.Settings.OutputGroups[0],
    Name: "File Group",
    OutputGroupSettings: {
      Type: "FILE_GROUP_SETTINGS",
      FileGroupSettings: {
        Destination: `s3://${MEDIACONVERT_BUCKET}/${fileName}`,
      },
    },
  };
  parsedJobSpec.Settings.Inputs = timeranges.split(",").map((timerange) => ({
    AudioSelectors: {
      "Audio Selector 1": {
        DefaultSelection: "DEFAULT",
      },
    },
    VideoSelector: {},
    TimecodeSource: "ZEROBASED",
    TamsSettings: {
      SourceId: sourceId,
      Timerange: timerange,
      GapHandling: "SKIP_GAPS",
      AuthConnectionArn: TAMS_AUTH_CONNECTION_ARN,
    },
    FileInput: AWS_TAMS_ENDPOINT,
  }));
  return parsedJobSpec;
};

export const useStartJob = () => {
  const credentials = useAwsCredentials();
  const { trigger, isMutating } = useSWRMutation(
    "mediaconvert-jobs",
    async (_, { arg }: { arg: CreateJobSpecParams }) => {
      const finalJobSpec = createFinalJobSpec(arg);
      const client = new MediaConvertClient({
        region: AWS_REGION,
        credentials,
      });
      const response = await client.send(new CreateJobCommand(finalJobSpec));
      if (!response.Job?.Id) {
        throw new Error("MediaConvert job ID not returned");
      }
      return response.Job.Id;
    },
  );

  return {
    start: trigger,
    isStarting: isMutating,
  };
};
