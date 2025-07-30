import { useState, useMemo } from "react";
import { getMediaConvertJobSpec } from "@/utils/getMediaConvertJobSpec";

export const useMediaConvertJobSpec = (sourceId, format = "mp4H264AAC") => {
  const baseJobSpec = useMemo(
    () => getMediaConvertJobSpec(sourceId, format),
    [sourceId, format]
  );

  const [jobSpec, setJobSpec] = useState(JSON.stringify(baseJobSpec, null, 2));

  const resetJobSpec = () => {
    setJobSpec(JSON.stringify(baseJobSpec, null, 2));
  };

  return { jobSpec, setJobSpec, resetJobSpec, baseJobSpec };
};
