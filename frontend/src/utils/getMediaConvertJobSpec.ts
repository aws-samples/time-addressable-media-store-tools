import { MEDIACONVERT_ROLE_ARN } from "@/constants";
import outputOptions from "@/data/mediaconvert-outputs.json";

export const getMediaConvertJobSpec = (optionsName: string) => ({
  Role: MEDIACONVERT_ROLE_ARN,
  Settings: {
    TimecodeConfig: {
      Source: "ZEROBASED",
    },
    OutputGroups: [
      {
        Outputs: (outputOptions as Record<string, unknown>)[optionsName],
      },
    ],
    FollowSource: 1,
  },
});
