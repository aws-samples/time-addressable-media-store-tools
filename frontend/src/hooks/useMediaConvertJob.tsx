import { useStartJob } from "@/hooks/useMediaConvert";
import useAlertsStore from "@/stores/useAlertsStore";
import type { Uuid, Timerange } from "@/types/tams";

type CreateJobParams = {
  jobSpec: string;
  sourceId: Uuid;
  fileName: string;
  timeranges: Timerange | Timerange[];
}

export const useMediaConvertJob = (onSuccess?: () => void) => {
  const { start, isStarting } = useStartJob();
  const addAlertItem = useAlertsStore((state) => state.addAlertItem);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);

  const createJob = async ({ jobSpec, sourceId, fileName, timeranges }: CreateJobParams) => {
    const id = crypto.randomUUID();
    const timerangeValue = Array.isArray(timeranges)
      ? timeranges.join(",")
      : timeranges;

    start(
      {
        spec: jobSpec,
        sourceId,
        fileName,
        timeranges: timerangeValue,
      },
      {
        onSuccess: (jobId: string) => {
          addAlertItem({
            type: "success",
            dismissible: true,
            dismissLabel: "Dismiss message",
            content: `MediaConvert Job: ${jobId} is being submitted...`,
            id,
            onDismiss: () => delAlertItem(id),
          });
          onSuccess?.();
        },
        onError: (err: Error) => {
          addAlertItem({
            type: "error",
            dismissible: true,
            dismissLabel: "Dismiss message",
            content: `MediaConvert Job Error: ${err.message}`,
            id,
            onDismiss: () => delAlertItem(id),
          });
          onSuccess?.();
        },
      }
    );
  };

  return { createJob, isStarting };
};
