import { useState } from "react";
import {
  Modal,
  Spinner,
  FormField,
  Select,
  Input,
  Checkbox,
  ExpandableSection,
  SpaceBetween,
  Button,
  Box,
} from "@cloudscape-design/components";
import useStore from "../stores/useStore";
import useOmakaseStore from "../stores/useOmakaseStore";
import { createInitialFormData, executeExport } from "../utils/omakase";

export default function OmakaseModal({ editTimeranges, flows }) {
  const [formData, setFormData] = useState(createInitialFormData(flows));
  const [isSpinnerVisible, setIsSpinnerVisible] = useState(false);
  const [showAdvancedContent, setShowAdvancedContent] = useState(false);
  const addAlertItem = useStore((state) => state.addAlertItem);
  const delAlertItem = useStore((state) => state.delAlertItem);

  const { omakaseModalVisible, setOmakaseModalVisible } = useOmakaseStore(
    (state) => state
  );

  const operations = ["Segment Concatenation", "Flow Creation"];
  const formats = ["TS", "MP4"];
  const isExportButtonDisabled =
    formData.operation === "Flow Creation" && formData.label === "";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSpinnerVisible(true);
    const id = crypto.randomUUID();
    try {
      await executeExport(formData, editTimeranges, flows);
      addAlertItem({
        id,
        type: "success",
        content: "Export successful",
        dismissible: true,
        dismissLabel: "Dismiss message",
        onDismiss: () => delAlertItem(id),
      });
    } catch (error) {
      addAlertItem({
        id,
        type: "error",
        content: "Export failed",
        dismissible: true,
        dismissLabel: "Dismiss message",
        onDismiss: () => delAlertItem(id),
      });
    } finally {
      setOmakaseModalVisible(false);
      setIsSpinnerVisible(false);
    }
  };

  const handleOperationChange = (e) => {
    setFormData((prevFormData) => {
      const newOperation = e.target.value;
      if (
        prevFormData.operation === "Segment Concatenation" &&
        newOperation !== "Segment Concatenation"
      ) {
        return {
          ...prevFormData,
          operation: newOperation,
          filename: "",
          bucket: "",
          path: "",
        };
      }
      return { ...prevFormData, operation: newOperation };
    });
  };

  return (
    <>
      <Modal
        onDismiss={() => setOmakaseModalVisible(false)}
        visible={omakaseModalVisible}
        header="Export"
      >
        <SpaceBetween direction="vertical" size="l">
          <FormField label="Operation">
            <Select
              selectedOption={{
                label: formData.operation,
                value: formData.operation,
              }}
              onChange={({ detail }) => {
                const e = { target: { value: detail.selectedOption.value } };
                handleOperationChange(e);
              }}
              options={operations.map((op) => ({ label: op, value: op }))}
            />
          </FormField>

          {formData.operation === "Segment Concatenation" && (
            <FormField label="Format">
              <Select
                selectedOption={{
                  label: formData.format,
                  value: formData.format,
                }}
                onChange={({ detail }) =>
                  setFormData((prevFormData) => ({
                    ...prevFormData,
                    format: detail.selectedOption.value,
                  }))
                }
                options={formats.map((format) => ({
                  label: format,
                  value: format,
                }))}
              />
            </FormField>
          )}

          {formData.operation === "Flow Creation" && (
            <FormField label="Label">
              <Input
                value={formData.label}
                onChange={({ detail }) =>
                  setFormData({ ...formData, label: detail.value })
                }
                placeholder="Label"
              />
            </FormField>
          )}

          <SpaceBetween direction="vertical" size="s">
            {flows
              .filter((flow) => flow.format === "urn:x-nmos:format:audio")
              .map((flow) => (
                <Checkbox
                  key={flow.id}
                  checked={formData.flows[flow.id] || false}
                  onChange={({ detail }) =>
                    setFormData((prev) => ({
                      ...prev,
                      flows: { ...prev.flows, [flow.id]: detail.checked },
                    }))
                  }
                >
                  {flow.description ?? ""}
                </Checkbox>
              ))}
          </SpaceBetween>

          <ExpandableSection
            headerText="Advanced"
            variant="footer"
            expanded={showAdvancedContent}
            onChange={({ detail }) => setShowAdvancedContent(detail.expanded)}
          >
            <SpaceBetween direction="vertical" size="m">
              <FormField label="Bucket">
                <Input
                  value={formData.bucket}
                  onChange={({ detail }) =>
                    setFormData({ ...formData, bucket: detail.value })
                  }
                  placeholder="Bucket"
                />
              </FormField>
              <FormField label="Path">
                <Input
                  value={formData.path}
                  onChange={({ detail }) =>
                    setFormData({ ...formData, path: detail.value })
                  }
                  placeholder="Path"
                />
              </FormField>
              <FormField label="Filename">
                <Input
                  value={formData.filename}
                  onChange={({ detail }) =>
                    setFormData({ ...formData, filename: detail.value })
                  }
                  placeholder="Filename"
                />
              </FormField>
            </SpaceBetween>
          </ExpandableSection>

          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              {isSpinnerVisible && <Spinner />}
              <Button
                variant="primary"
                disabled={isExportButtonDisabled}
                onClick={handleSubmit}
              >
                Export
              </Button>
            </SpaceBetween>
          </Box>
        </SpaceBetween>
      </Modal>
    </>
  );
}
