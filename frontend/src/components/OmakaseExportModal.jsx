import { useState, useMemo, useEffect } from "react";
import {
  Button,
  FormField,
  Select,
  Modal,
  SpaceBetween,
  Multiselect,
  Header,
  Box,
  Container,
} from "@cloudscape-design/components";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import DynamicForm from "@/components/DynamicForm";
import useAlertsStore from "@/stores/useAlertsStore";
import { executeExport } from "@/utils/executeExport";
import { fetchAuthSession } from "aws-amplify/auth";
import { AWS_REGION, OMAKASE_EXPORT_EVENT_PARAMETER } from "@/constants";

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

  const [operationSchemas, setOperationSchemas] = useState({});
  const [formData, setFormData] = useState({});
  const [formSchema, setFormSchema] = useState(null);
  const [selectedFlows, setSelectedFlows] = useState(flowOptions);
  const [isLoading, setIsLoading] = useState(false);
  const addAlertItem = useAlertsStore((state) => state.addAlertItem);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);

  const operations = useMemo(
    () =>
      Object.entries(operationSchemas).map(([key, { title }]) => ({
        value: key,
        label: title,
      })),
    [operationSchemas]
  );

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
        // Initialize with first operation
        const firstOperation = Object.keys(data)[0];
        if (firstOperation) {
          const schema = data[firstOperation];
          setFormSchema(schema);
          setFormData(initializeFormData(firstOperation, schema));
        }
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
    fetchOperationSchemas();
  }, []);

  useEffect(() => {
    setSelectedFlows(flowOptions);
  }, [flowOptions]);

  const handleOperationChange = (event) => {
    const operation = event.detail.selectedOption.value;
    const schema = operationSchemas[operation];
    setFormSchema(schema);
    setFormData(initializeFormData(operation, schema));
  };

  const resetForm = () => {
    const firstOperation = Object.keys(operationSchemas)[0];
    if (firstOperation) {
      setFormSchema(operationSchemas[firstOperation]);
      setFormData(
        initializeFormData(firstOperation, operationSchemas[firstOperation])
      );
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

  return (
    <Modal
      onDismiss={() => {
        onModalToggle(false);
        resetForm();
      }}
      visible={isModalOpen}
      header="Export"
    >
      <SpaceBetween direction="vertical" size="l">
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

        <Container header={<Header variant="h3">Configuration</Header>}>
          {formSchema && (
            <DynamicForm
              schema={formSchema}
              formData={formData}
              onChange={({ formData }) => setFormData(formData)}
            ></DynamicForm>
          )}
        </Container>

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
      </SpaceBetween>
    </Modal>
  );
};

export default OmakaseExportModal;
