import { useState, useMemo, useEffect } from "react";
import {
  Button,
  FormField,
  Input,
  Select,
  Modal,
  SpaceBetween,
  Multiselect,
  Box,
  Textarea,
} from "@cloudscape-design/components";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import DynamicForm from "@/components/DynamicForm";
import useAlertsStore from "@/stores/useAlertsStore";
import { executeExport } from "@/utils/executeExport";
import validateJson from "@/utils/validateJson";
import { getMediaConvertJobSpec } from "@/utils/getMediaConvertJobSpec";
import { useStartJob } from "@/hooks/useMediaConvert";
import { fetchAuthSession } from "aws-amplify/auth";
import { AWS_REGION, OMAKASE_EXPORT_EVENT_PARAMETER } from "@/constants";

const STATIC_OPERATIONS = {
  MEDIACONVERT_EXPORT: { title: "MediaConvert Export", schema: null },
};

const initializeFormData = (operation, schema) => {
  const formData = { operation };
  if (schema?.properties) {
    Object.entries(schema.properties).forEach(([fieldName, fieldSchema]) => {
      formData[fieldName] = fieldSchema.default ?? "";
    });
  }
  return formData;
};

const OmakaseExportModal = ({
  sourceId,
  editTimeranges,
  flows,
  onModalToggle,
  isModalOpen,
}) => {
  const flowOptions = useMemo(
    () =>
      flows?.map((flow) => ({
        label: flow.description ?? flow.label,
        value: flow.id,
        tags: [flow.format],
      })) ?? [],
    [flows]
  );
  const baseJobSpec = getMediaConvertJobSpec(sourceId, "mp4H264AAC");

  const { start, isStarting } = useStartJob();
  const [jobSpec, setJobSpec] = useState(JSON.stringify(baseJobSpec, null, 2));
  const [operationSchemas, setOperationSchemas] = useState({});
  const [formData, setFormData] = useState({});
  const [formSchema, setFormSchema] = useState(null);
  const [selectedFlows, setSelectedFlows] = useState(flowOptions);
  const [isLoading, setIsLoading] = useState(false);
  const addAlertItem = useAlertsStore((state) => state.addAlertItem);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);

  const operations = useMemo(() => {
    const staticOptions = Object.entries(STATIC_OPERATIONS).map(
      ([key, { title }]) => ({
        value: key,
        label: title,
      })
    );
    const dynamicOptions = Object.entries(operationSchemas).map(
      ([key, { title }]) => ({
        value: key,
        label: title,
      })
    );
    return [...staticOptions, ...dynamicOptions];
  }, [operationSchemas]);

  useEffect(() => {
    const fetchOperationSchemas = async () => {
      const parameterValue = await fetchAuthSession().then((session) =>
        new SSMClient({ region: AWS_REGION, credentials: session.credentials })
          .send(
            new GetParameterCommand({ Name: OMAKASE_EXPORT_EVENT_PARAMETER })
          )
          .then((response) => response.Parameter.Value)
      );
      try {
        const data = JSON.parse(parameterValue);
        setOperationSchemas(data);
      } catch (error) {
        const id = crypto.randomUUID();
        addAlertItem({
          id,
          type: "error",
          content: `Error parsing the SSM parameter: ${OMAKASE_EXPORT_EVENT_PARAMETER}. ${error}`,
          dismissible: true,
          dismissLabel: "Dismiss message",
          onDismiss: () => delAlertItem(id),
        });
      }
    };

    // Initialize with first operation
    const firstOperation = Object.keys(STATIC_OPERATIONS)[0];
    if (firstOperation) {
      setFormSchema(STATIC_OPERATIONS[firstOperation].schema);
      setFormData({ operation: firstOperation });
    }

    fetchOperationSchemas();
  }, []);

  useEffect(() => {
    setSelectedFlows(flowOptions);
  }, [flowOptions]);

  const handleOperationChange = (event) => {
    const operation = event.detail.selectedOption.value;
    const staticOperation = STATIC_OPERATIONS[operation];

    if (staticOperation) {
      setFormSchema(staticOperation.schema);
      setFormData(initializeFormData(operation, staticOperation.schema));
    } else {
      const schema = operationSchemas[operation];
      setFormSchema(schema);
      setFormData(initializeFormData(operation, schema));
    }
  };

  const resetForm = () => {
    const firstOperation = Object.keys(STATIC_OPERATIONS)[0];
    if (firstOperation) {
      setFormSchema(STATIC_OPERATIONS[firstOperation].schema);
      setFormData({ operation: firstOperation });
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    const exportResult = await executeExport(
      formData,
      editTimeranges,
      selectedFlows.map((flow) => flow.value),
      sourceId
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

  // Dynamic validation based on required fields in current schema
  const isExportButtonDisabled = useMemo(() => {
    if (selectedFlows.length === 0) return true;
    return (
      formSchema?.required?.some((fieldName) => !formData[fieldName]?.trim()) ??
      false
    );
  }, [selectedFlows.length, formSchema?.required, formData]);

  const handleDismiss = () => {
    onModalToggle(false);
    resetForm();
    setJobSpec(JSON.stringify(baseJobSpec, null, 2));
  };

  const createJob = async () => {
    const id = crypto.randomUUID();
    start(
      {
        spec: jobSpec,
        sourceId,
        timeranges: editTimeranges.join(","),
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

  return (
    <Modal
      onDismiss={handleDismiss}
      visible={isModalOpen}
      header="Export"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              variant="link"
              disabled={isStarting}
              loading={isStarting || isLoading}
              onClick={handleDismiss}
            >
              Cancel
            </Button>

            {formSchema ? (
              <Box float="right">
                <Button
                  variant="primary"
                  disabled={isExportButtonDisabled}
                  onClick={handleSubmit}
                  loading={isLoading}
                >
                  Export
                </Button>
              </Box>
            ) : (
              <Button
                variant="primary"
                loading={isStarting}
                disabled={
                  isStarting ||
                  !editTimeranges ||
                  !validateJson(jobSpec).isValid
                }
                onClick={createJob}
              >
                Export
              </Button>
            )}
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween direction="vertical" size="xs">
        <FormField label="Flows">
          <Multiselect
            selectedOptions={selectedFlows}
            onChange={({ detail }) => setSelectedFlows(detail.selectedOptions)}
            options={flowOptions}
            placeholder="Select Flows"
            inlineTokens
          />
        </FormField>

        <FormField label="Operation">
          <Select
            selectedOption={operations.find(
              (op) => op.value === formData.operation
            )}
            onChange={handleOperationChange}
            options={operations}
          />
        </FormField>

        {formSchema && (
          <DynamicForm
            schema={formSchema}
            formData={formData}
            onChange={({ formData }) => setFormData(formData)}
          ></DynamicForm>
        )}

        {formData.operation === "MEDIACONVERT_EXPORT" && (
          <SpaceBetween size="xs">
            <FormField label="Timerange">
              <Input value={editTimeranges.join(",")} readOnly />
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
        )}
      </SpaceBetween>
    </Modal>
  );
};

export default OmakaseExportModal;
