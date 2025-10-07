import { MEDIACONVERT_ROLE_ARN } from "@/constants";
import outputOptions from "./mediaconvert-outputs.json";

export const getMediaConvertJobSpec = (optionsName) => ({
  Role: MEDIACONVERT_ROLE_ARN,
  Settings: {
    TimecodeConfig: {
      Source: "ZEROBASED",
    },
    OutputGroups: [
      {
        Outputs: outputOptions[optionsName],
      },
    ],
    FollowSource: 1,
  },
});
