import {
  MediaConvertClient,
  CreateJobCommand,
  paginateListJobs,
} from "@aws-sdk/client-mediaconvert";
import { AWS_REGION, MEDIACONVERT_BUCKET } from "@/constants";
import { fetchAuthSession } from "aws-amplify/auth";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import { AWS_TAMS_ENDPOINT, TAMS_AUTH_CONNECTION_ARN } from "@/constants";

const isTamsJob = (job) => {
  return job.Settings?.Inputs?.some((input) => input.TamsSettings);
};

const mediaConvertFetcher = async () => {
  const client = await fetchAuthSession().then(
    (session) =>
      new MediaConvertClient({
        region: AWS_REGION,
        credentials: session.credentials,
      })
  );
  const allJobs = [];
  for await (const page of paginateListJobs({ client }, {})) {
    allJobs.push(...page.Jobs);
  }
  return allJobs.filter(isTamsJob);
};

export const useTamsJobs = () => {
  const { data, mutate, error, isLoading } = useSWR(
    "mediaconvert-jobs",
    mediaConvertFetcher,
    {
      refreshInterval: 3000,
    }
  );

  return {
    jobs: data,
    mutate,
    isLoading,
    error,
  };
};

const createFinalJobSpec = ({ spec, sourceId, fileName, timeranges }) => {
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
  const { trigger, isMutating } = useSWRMutation(
    "mediaconvert-jobs",
    async (_, { arg }) => {
      const finalJobSpec = createFinalJobSpec(arg);
      const response = await fetchAuthSession().then((session) =>
        new MediaConvertClient({
          region: AWS_REGION,
          credentials: session.credentials,
        })
          .send(new CreateJobCommand(finalJobSpec))
          .then((response) => response)
      );
      return response.Job.Id;
    }
  );

  return {
    start: (args, options) => trigger(args, options),
    isStarting: isMutating,
  };
};
