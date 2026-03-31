import { useState } from "react";
import {
  Checkbox,
  FormField,
  Input,
  Modal,
  SpaceBetween,
  Textarea,
  TextContent,
} from "@cloudscape-design/components";
import CancelModalFooter from "@/components/CancelModalFooter";
import { AWS_HLS_INGEST_ARN } from "@/constants";
import { useStateMachine } from "@/hooks/useStateMachine";
import useAlertsStore from "@/stores/useAlertsStore";
import stringify from "json-stable-stringify";
import type { ChannelIngestion } from "@/types/ingestHls"

type Props = {
  modalVisible: boolean,
  setModalVisible: React.Dispatch<React.SetStateAction<boolean>>,
  selectedItem: ChannelIngestion | undefined,
  setSelectedItem: React.Dispatch<React.SetStateAction<ChannelIngestion | undefined>>,
}

const StartIngestModal = ({
  modalVisible,
  setModalVisible,
  selectedItem,
  setSelectedItem,
}: Props) => {
  const [useEpoch, setUseEpoch] = useState(false);
  const [label, setLabel] = useState("");
  const { execute, isExecuting } = useStateMachine();
  const addAlertItem = useAlertsStore((state) => state.addAlertItem);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);

  const performAction = async () => {
    const id = `medialive-${selectedItem!.id}-${Date.now()}`;
    await execute({
      stateMachineArn: AWS_HLS_INGEST_ARN,
      name: id,
      input: stringify({
        label,
        manifestLocation: selectedItem!.manifestUri,
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
    setSelectedItem(undefined);
    setLabel("");
  };

  const handleDismiss = async () => {
    setModalVisible(false);
    setSelectedItem(undefined);
    setLabel("");
  };

  return (
    <Modal
      onDismiss={handleDismiss}
      visible={modalVisible}
      footer={
        <CancelModalFooter
          onCancel={handleDismiss}
          onSubmit={performAction}
          submitText="Yes"
          submitLoading={isExecuting}
          cancelDisabled={isExecuting}
        />
      }
      header="Confirmation"
    >
      <SpaceBetween size="xs">
        <FormField
          description="The following manifest will be processed and ingested."
          label="Manifest URI"
          warningText={
            selectedItem?.manifestExists &&
            "Content already exists in this location.  Starting ingest now will ingest this into TAMS.  If you are setting up a new ingest process then you may wish to delete the existing content before starting the ingest process."
          }
        >
          <Textarea value={selectedItem?.manifestUri ?? ""} readOnly />
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
