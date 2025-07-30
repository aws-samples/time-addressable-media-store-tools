import { useState } from "react";
import {
  Box,
  Button,
  FormField,
  Input,
  Modal,
  SpaceBetween,
  Textarea,
} from "@cloudscape-design/components";
import useAlertsStore from "@/stores/useAlertsStore";
import validateJson from "@/utils/validateJson";
import { getMediaConvertJobSpec } from "@/utils/getMediaConvertJobSpec";
import { useStartJob } from "@/hooks/useMediaConvert";

const CreateExportModal = ({
  modalVisible,
  setModalVisible,
  selectedSourceId,
}) => {
  const baseJobSpec = getMediaConvertJobSpec(
    selectedSourceId,
    "mp4H264AAC"
  );
  const { start, isStarting } = useStartJob();
  const [timeranges, setTimeranges] = useState("");
  const [jobSpec, setJobSpec] = useState(JSON.stringify(baseJobSpec, null, 2));
  const addAlertItem = useAlertsStore((state) => state.addAlertItem);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);
  const [timerangeError, setTimerangeError] = useState("");

  const handleDismiss = () => {
    setModalVisible(false);
    setTimeranges("");
    setJobSpec(JSON.stringify(baseJobSpec, null, 2));
  };

  const createJob = async () => {
    const id = crypto.randomUUID();
    start(
      {
        spec: jobSpec,
        sourceId: selectedSourceId,
        timeranges,
      },
      {
        onSuccess: (jobId) => {
          addAlertItem({
            type: "success",
            dismissible: true,
            dismissLabel: "Dismiss message",
            content: `MediaConvert Job: ${jobId} is being submitted...`,
            id: id,
            onDismiss: () => delAlertItem(id),
          });
          handleDismiss();
        },
        onError: (err) => {
          addAlertItem({
            type: "error",
            dismissible: true,
            dismissLabel: "Dismiss message",
            content: `MediaConvert Job Error: ${err.message}`,
            id: id,
            onDismiss: () => delAlertItem(id),
          });
          handleDismiss();
        },
      }
    );
  };

  const validateTimerange = (value) => {
    const timerangeRegex =
      /^[\[\(]\d+:\d{1,9}_\d+:\d{1,9}[\]\)](,[\[\(]\d+:\d{1,9}_\d+:\d{1,9}[\]\)])*$/;
    if (!value) return "Timerange is required";
    if (!timerangeRegex.test(value))
      return "Invalid timerange format, must match [[(]d+:d{1,9}_d+:d{1,9}[])]";
    return "";
  };

  return (
    <Modal
      onDismiss={handleDismiss}
      visible={modalVisible}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              variant="link"
              disabled={isStarting}
              onClick={handleDismiss}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={isStarting}
              disabled={
                isStarting || !timeranges || !validateJson(jobSpec).isValid
              }
              onClick={createJob}
            >
              Create
            </Button>
          </SpaceBetween>
        </Box>
      }
      header="Create MediaConvert Job"
    >
      <SpaceBetween size="xs">
        <FormField
          description="[MANDATORY] Provide a timerange or timeranges (comma delimited) for the segments to be processed."
          label="Timerange"
          errorText={timerangeError}
        >
          <Input
            value={timeranges}
            invalid={!!timerangeError}
            onChange={({ detail }) => {
              setTimeranges(detail.value);
            }}
            onBlur={() => {
              setTimerangeError(validateTimerange(timeranges));
            }}
          />
        </FormField>
        <FormField
          label="Job Specification"
          warningText={validateJson(jobSpec).error?.message}
        >
          <Textarea
            rows={20}
            disableBrowserAutocorrect
            spellcheck={false}
            value={jobSpec}
            onChange={({ detail }) => {
              setJobSpec(detail.value);
            }}
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
};

export default CreateExportModal;
