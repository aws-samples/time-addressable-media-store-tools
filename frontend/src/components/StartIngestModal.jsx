import { useState } from "react";
import {
  Box,
  Button,
  FormField,
  Input,
  Modal,
  SpaceBetween,
  Textarea,
  TextContent,
} from "@cloudscape-design/components";
import { AWS_HLS_INGEST_ARN } from "@/constants";
import { useStateMachine } from "@/hooks/useStateMachine";
import useStore from "@/stores/useStore";
import stringify from "json-stable-stringify";

const StartIngestModal = ({
  modalVisible,
  setModalVisible,
  source,
  recordId,
  initialManifest,
  setSelectedItem,
  readOnlyManifest,
}) => {
  const [label, setLabel] = useState("");
  const [manifestUri, setManifestUri] = useState(initialManifest);
  const { execute, isExecuting } = useStateMachine();
  const addAlertItem = useStore((state) => state.addAlertItem);
  const delAlertItem = useStore((state) => state.delAlertItem);

  const performAction = async () => {
    const id = `${source}-${recordId}-${Date.now()}`;
    await execute({
      stateMachineArn: AWS_HLS_INGEST_ARN,
      name: id,
      input: stringify({
        label,
        manifest_location: manifestUri,
      }),
      traceHeader: id,
    });
    addAlertItem({
      type: "success",
      dismissible: true,
      dismissLabel: "Dismiss message",
      content: (
        <TextContent>
          A new ingestion process: {id} has been started...
        </TextContent>
      ),
      id: id,
      onDismiss: () => delAlertItem(id),
    });
    setModalVisible(false);
    setSelectedItem();
    setManifestUri(initialManifest);
    setLabel("");
  };

  const handleDismiss = async () => {
    setModalVisible(false);
    setSelectedItem();
    setManifestUri(initialManifest);
    setLabel("");
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
              disabled={isExecuting}
              onClick={handleDismiss}
            >
              No
            </Button>
            <Button
              variant="primary"
              loading={isExecuting}
              onClick={performAction}
            >
              Yes
            </Button>
          </SpaceBetween>
        </Box>
      }
      header="Confirmation"
    >
      <SpaceBetween size="xs">
        <FormField
          description="The following manifest will be processed and ingested."
          label="Manifest URI"
        >
          <Textarea
            value={manifestUri}
            readOnly={readOnlyManifest}
            onChange={({ detail }) => {
              setManifestUri(detail.value);
            }}
            placeholder="Enter an http/s url or S3 uri"
          />
        </FormField>
        <FormField
          description="Provide a value for the label to use in TAMS."
          label="Label"
        >
          <Input
            value={label}
            onChange={({ detail }) => {
              setLabel(detail.value);
            }}
          />
        </FormField>
        <TextContent>Are you sure you wish to START an Ingestion?</TextContent>
      </SpaceBetween>
    </Modal>
  );
};

export default StartIngestModal;
