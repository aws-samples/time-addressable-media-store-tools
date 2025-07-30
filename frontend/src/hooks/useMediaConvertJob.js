import { useStartJob } from "@/hooks/useMediaConvert";
import useAlertsStore from "@/stores/useAlertsStore";

export const useMediaConvertJob = (onSuccess) => {
  const { start, isStarting } = useStartJob();
  const addAlertItem = useAlertsStore((state) => state.addAlertItem);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);

  const createJob = async ({ jobSpec, sourceId, timeranges }) => {
    const id = crypto.randomUUID();
    const timerangeValue = Array.isArray(timeranges)
      ? timeranges.join(",")
      : timeranges;

    start(
      {
        spec: jobSpec,
        sourceId,
        timeranges: timerangeValue,
      },
      {
        onSuccess: (jobId) => {
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
        onError: (err) => {
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
