import { useState } from "react";
import { Modal } from "@cloudscape-design/components";
import validateJson from "@/utils/validateJson";
import MediaConvertExportForm from "@/components/MediaConvertExportForm";
import ExportModalFooter from "@/components/ExportModalFooter";
import { useMediaConvertJob } from "@/hooks/useMediaConvertJob";
import { useMediaConvertJobSpec } from "@/hooks/useMediaConvertJobSpec";

const CreateExportModal = ({
  modalVisible,
  setModalVisible,
  selectedSourceId,
}) => {
  const handleDismiss = () => {
    setModalVisible(false);
    setTimeranges("");
    resetJobSpec();
  };

  const { jobSpec, setJobSpec, resetJobSpec } = useMediaConvertJobSpec(selectedSourceId);
  const { createJob, isStarting } = useMediaConvertJob(handleDismiss);
  const [timeranges, setTimeranges] = useState("");
  const [timerangeError, setTimerangeError] = useState("");

  const handleCreateJob = () => {
    createJob({ jobSpec, sourceId: selectedSourceId, timeranges });
  };

  const validateTimerange = (value) => {
    const timerangeRegex =
      /^[\[\(]\d+:\d{1,9}_\d+:\d{1,9}[\]\)](,[\[\(]\d+:\d{1,9}_\d+:\d{1,9}[\]\)])*$/;
    if (!value) return "Timerange is required";
    if (!timerangeRegex.test(value))
      return "Invalid timerange format, must match [[(]d+:d{1,9}_d+:d{1,9}[])]";
    return "";
  };

  const handleTimerangeChange = (value) => {
    setTimeranges(value);
  };

  const handleTimerangeBlur = () => {
    setTimerangeError(validateTimerange(timeranges));
  };

  return (
    <Modal
      onDismiss={handleDismiss}
      visible={modalVisible}
      footer={
        <ExportModalFooter
          onCancel={handleDismiss}
          onSubmit={handleCreateJob}
          submitText="Create"
          submitDisabled={
            isStarting || !timeranges || !validateJson(jobSpec).isValid
          }
          submitLoading={isStarting}
          cancelDisabled={isStarting}
        />
      }
      header="Create MediaConvert Job"
    >
      <MediaConvertExportForm
        timeranges={timeranges}
        onTimerangesChange={handleTimerangeChange}
        jobSpec={jobSpec}
        onJobSpecChange={setJobSpec}
        timerangeProps={{
          description:
            "[MANDATORY] Provide a timerange or timeranges (comma delimited) for the segments to be processed.",
          errorText: timerangeError,
          inputProps: {
            invalid: !!timerangeError,
            onBlur: handleTimerangeBlur,
          },
        }}
      />
    </Modal>
  );
};

export default CreateExportModal;
