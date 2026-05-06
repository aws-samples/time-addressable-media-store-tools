import { useState } from "react";
import {
  FormField,
  Input,
  Modal,
  SpaceBetween,
  Textarea,
  TextContent,
} from "@cloudscape-design/components";
import CancelModalFooter from "@/components/CancelModalFooter";
import UuidInput from "@/components/UuidInput";
import { AWS_HLS_INGEST_ARN } from "@/constants";
import { useStateMachine } from "@/hooks/useStateMachine";
import useAlertsStore from "@/stores/useAlertsStore";
import { isValidUuid } from "@/utils/validateUuid";
import stringify from "json-stable-stringify";

type Props = {
  modalVisible: boolean;
  setModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  idPrefix: string;
  manifestUri?: string;
  manifestWarningText?: string;
  onDismiss?: () => void;
};

const HlsIngestModal = ({
  modalVisible,
  setModalVisible,
  idPrefix,
  manifestUri: externalManifestUri,
  manifestWarningText,
  onDismiss,
}: Props) => {
  const [label, setLabel] = useState("");
  const [internalManifestUri, setInternalManifestUri] = useState("");
  const [sourceId, setSourceId] = useState<string>(crypto.randomUUID());
  const { execute, isExecuting } = useStateMachine();
  const addAlertItem = useAlertsStore((state) => state.addAlertItem);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);

  const isReadOnly = externalManifestUri !== undefined;
  const manifestUri = isReadOnly ? externalManifestUri : internalManifestUri;

  const performAction = async () => {
    try {
      const id = `${idPrefix}-${Date.now()}`;
      await execute({
        stateMachineArn: AWS_HLS_INGEST_ARN,
        name: id,
        input: stringify({
          label,
          manifestLocation: manifestUri,
          ...(sourceId ? { sourceId } : {}),
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
    } catch {
      // Alert emitted by useApi
    } finally {
      handleDismiss();
    }
  };

  const handleDismiss = () => {
    setModalVisible(false);
    setLabel("");
    setInternalManifestUri("");
    setSourceId(crypto.randomUUID());
    onDismiss?.();
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
          submitDisabled={Boolean(sourceId) && !isValidUuid(sourceId)}
          cancelDisabled={isExecuting}
        />
      }
      header="Confirmation"
    >
      <SpaceBetween size="xs">
        <FormField
          description="The following manifest will be processed and ingested."
          label="Manifest URI"
          warningText={manifestWarningText}
        >
          {isReadOnly ? (
            <Textarea value={manifestUri} readOnly />
          ) : (
            <Textarea
              value={manifestUri}
              onChange={({ detail }) => setInternalManifestUri(detail.value)}
              placeholder="Enter an http/s url or S3 uri"
            />
          )}
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
        <UuidInput
          label="Source Id"
          description="A new Source Id has been generated. Change this if desired."
          value={sourceId}
          onChange={setSourceId}
        />
        <TextContent>Are you sure you wish to START an Ingestion?</TextContent>
      </SpaceBetween>
    </Modal>
  );
};

export default HlsIngestModal;
