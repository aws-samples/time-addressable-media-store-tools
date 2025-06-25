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
import {
  executeExport,
  createInitialFormData,
} from "../views/OmakasePlayer/util/omakase-export-util";
import useStore from "../stores/useStore";

export default function OmakaseModal({
  flows,
  source,
  markerOffset,
  exportDisabled,
  omakasePlayer,
  trigger,
}) {
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState(createInitialFormData(flows));
  const [isSpinnerVisible, setIsSpinnerVisible] = useState(false);
  const addAlertItem = useStore((state) => state.addAlertItem);

  const operations = ["Segment Concatenation", "Flow Creation"];
  const formats = ["TS", "MP4"];
  const isExportButtonDisabled =
    formData.operation === "Flow Creation" && formData.label === "";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSpinnerVisible(true);

    try {
      await executeExport(formData, flows, source, markerOffset, omakasePlayer);
      addAlertItem({
        id: Date.now().toString(),
        type: "success",
        content: "Export successful",
      });
    } catch (error) {
      addAlertItem({
        id: Date.now().toString(),
        type: "error",
        content: "Export failed",
      });
    } finally {
      setShowModal(false);
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

  if (exportDisabled) {
    return <div className="segmentation-export-disabled">{trigger}</div>;
  }

  return (
    <>
      <div onClick={() => setShowModal(true)}>{trigger}</div>
      <Modal
        onDismiss={() => setShowModal(false)}
        visible={showModal}
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
            expanded={formData.operation === "Segment Concatenation"}
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
