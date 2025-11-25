import { useState, useMemo, useEffect } from "react";
import { Modal, SpaceBetween, Box } from "@cloudscape-design/components";
import useAlertsStore from "@/stores/useAlertsStore";
import { useExportOperations } from "@/hooks/useExportOperations";
import { useExportForm } from "@/hooks/useExportForm";
import { useMediaConvertJob } from "@/hooks/useMediaConvertJob";
import { useMediaConvertJobSpec } from "@/hooks/useMediaConvertJobSpec";
import useAwsCredentials from "@/hooks/useAwsCredentials";
import { executeExport } from "@/utils/executeExport";
import validateJson from "@/utils/validateJson";
import FlowSelector from "./FlowSelector";
import OperationSelector from "./OperationSelector";
import MediaConvertExportForm from "./MediaConvertExportForm";
import DynamicForm from "./DynamicForm";
import ExportModalFooter from "./ExportModalFooter";
import {
  HAS_OMAKASE_EXPORT_CAPABILITY,
  IS_MEDIACONVERT_DEPLOYED,
} from "@/constants";

const OmakaseExportModal = ({
  sourceId,
  editTimeranges,
  flows,
  onModalToggle,
  isModalOpen,
}) => {
  const handleDismiss = () => {
    onModalToggle(false);
    resetForm();
    setFileName(sourceId);
    resetJobSpec();
  };
  const credentials = useAwsCredentials();
  const { jobSpec, setJobSpec, resetJobSpec } = useMediaConvertJobSpec();
  const { createJob, isStarting } = useMediaConvertJob(handleDismiss);
  const { operations, getOperationSchema } = useExportOperations();
  const {
    formData,
    setFormData,
    formSchema,
    handleOperationChange,
    resetForm,
    isFormValid,
  } = useExportForm(getOperationSchema);

  const availableOperations = useMemo(() => {
    return operations.filter((op) => {
      if (op.value === "MEDIACONVERT_EXPORT") {
        return IS_MEDIACONVERT_DEPLOYED;
      }
      return HAS_OMAKASE_EXPORT_CAPABILITY;
    });
  }, [operations]);

  const flowOptions = useMemo(
    () =>
      flows?.map((flow) => ({
        label: flow.description ?? flow.label,
        value: flow.id,
        tags: [flow.format],
      })) ?? [],
    [flows]
  );

  const [selectedFlows, setSelectedFlows] = useState(flowOptions);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState(sourceId);
  const addAlertItem = useAlertsStore((state) => state.addAlertItem);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);

  useEffect(() => {
    setSelectedFlows(flowOptions);
  }, [flowOptions]);

  const handleSubmit = async () => {
    setIsLoading(true);
    const exportResult = await executeExport(
      formData,
      editTimeranges,
      selectedFlows.map((flow) => flow.value),
      sourceId,
      credentials
    );
    const id = crypto.randomUUID();
    addAlertItem({
      id,
      type: exportResult,
      content: `Export ${exportResult === "success" ? "successful" : "failed"}`,
      dismissible: true,
      dismissLabel: "Dismiss message",
      onDismiss: () => delAlertItem(id),
    });
    onModalToggle(false);
    resetForm();
    setIsLoading(false);
  };

  const isExportButtonDisabled = useMemo(() => {
    return selectedFlows.length === 0 || !isFormValid;
  }, [selectedFlows.length, isFormValid]);

  const handleCreateJob = () => {
    createJob({ jobSpec, sourceId, fileName, timeranges: editTimeranges });
  };

  return (
    <Modal
      onDismiss={handleDismiss}
      visible={isModalOpen}
      header="Export"
      footer={
        formSchema ? (
          <ExportModalFooter
            onCancel={handleDismiss}
            onSubmit={handleSubmit}
            submitText="Export"
            submitDisabled={
              isExportButtonDisabled || availableOperations.length === 0
            }
            submitLoading={isLoading}
            cancelDisabled={isStarting}
            cancelLoading={isStarting || isLoading}
          />
        ) : (
          <ExportModalFooter
            onCancel={handleDismiss}
            onSubmit={handleCreateJob}
            submitText="Export"
            submitDisabled={
              isStarting ||
              !editTimeranges ||
              !validateJson(jobSpec).isValid ||
              availableOperations.length === 0
            }
            submitLoading={isStarting}
            cancelDisabled={isStarting}
          />
        )
      }
    >
      <SpaceBetween direction="vertical" size="xs">
        <FlowSelector
          flows={flows}
          selectedFlows={selectedFlows}
          onChange={setSelectedFlows}
        />

        {availableOperations.length === 0 ? (
          <Box textAlign="center">
            <SpaceBetween size="s">
              <Box variant="strong">No export operations available</Box>
              <Box variant="p">
                Export functionality requires backend deployment.
              </Box>
            </SpaceBetween>
          </Box>
        ) : (
          <>
            <OperationSelector
              operations={availableOperations}
              selectedOperation={formData.operation}
              onChange={handleOperationChange}
            />

            {formSchema && (
              <DynamicForm
                schema={formSchema}
                formData={formData}
                onChange={({ formData }) => setFormData(formData)}
              />
            )}

            {formData.operation === "MEDIACONVERT_EXPORT" && (
              <MediaConvertExportForm
                timeranges={editTimeranges}
                fileName={fileName}
                setFileName={setFileName}
                jobSpec={jobSpec}
                onJobSpecChange={setJobSpec}
                readOnly={true}
              />
            )}
          </>
        )}
      </SpaceBetween>
    </Modal>
  );
};

export default OmakaseExportModal;
