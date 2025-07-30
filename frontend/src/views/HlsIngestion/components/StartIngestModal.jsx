import { useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  FormField,
  Input,
  Modal,
  SpaceBetween,
  Textarea,
  TextContent,
} from "@cloudscape-design/components";
import { AWS_HLS_INGEST_ARN } from "@/constants";
import { useStateMachine } from "@/hooks/useStateMachine";
import useAlertsStore from "@/stores/useAlertsStore";
import stringify from "json-stable-stringify";

const StartIngestModal = ({ modalVisible, setModalVisible }) => {
  const [useEpoch, setUseEpoch] = useState(false);
  const [label, setLabel] = useState("");
  const [manifestUri, setManifestUri] = useState("");
  const { execute, isExecuting } = useStateMachine();
  const addAlertItem = useAlertsStore((state) => state.addAlertItem);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);

  const performAction = async () => {
    const id = `hls-${crypto.randomUUID()}-${Date.now()}`;
    await execute({
      stateMachineArn: AWS_HLS_INGEST_ARN,
      name: id,
      input: stringify({
        label,
        manifestLocation: manifestUri,
        useEpoch: useEpoch,
      }),
      traceHeader: id,
    });
    addAlertItem({
      type: "success",
      dismissible: true,
      dismissLabel: "Dismiss message",
      content: `A new ingestion process: ${id} has been started...`,
      id: id,
      onDismiss: () => delAlertItem(id),
    });
    setModalVisible(false);
    setManifestUri("");
    setLabel("");
  };

  const handleDismiss = async () => {
    setModalVisible(false);
    setManifestUri("");
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
            onChange={({ detail }) => {
              setManifestUri(detail.value);
            }}
            placeholder="Enter an http/s url or S3 uri"
          />
        </FormField>
        <Checkbox
          onChange={({ detail }) => setUseEpoch(detail.checked)}
          checked={useEpoch}
        >
          Use the Last Modified timestamp of the manifest as the start of the
          TAMS timerange.
        </Checkbox>
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
