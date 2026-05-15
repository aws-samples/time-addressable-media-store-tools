import { useState } from "react";
import {
  Alert,
  Button,
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
  onDeleteManifest?: () => Promise<void>;
  onDismiss?: () => void;
};

const HlsIngestModal = ({
  modalVisible,
  setModalVisible,
  idPrefix,
  manifestUri: externalManifestUri,
  manifestWarningText,
  onDeleteManifest,
  onDismiss,
}: Props) => {
  const [label, setLabel] = useState("");
  const [internalManifestUri, setInternalManifestUri] = useState("");
  const [sourceId, setSourceId] = useState<string>(crypto.randomUUID());
  const { execute, isExecuting } = useStateMachine();
  const [isDeleting, setIsDeleting] = useState(false);
  const [warningCleared, setWarningCleared] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteError, setDeleteError] = useState("");
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

  const handleDeleteManifest = async () => {
    if (!onDeleteManifest) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      await onDeleteManifest();
      setWarningCleared(true);
      setDeleteModalVisible(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete existing manifest.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteDismiss = () => {
    setDeleteModalVisible(false);
    setDeleteError("");
  };

  const handleDismiss = () => {
    setModalVisible(false);
    setLabel("");
    setInternalManifestUri("");
    setSourceId(crypto.randomUUID());
    setWarningCleared(false);
    setDeleteModalVisible(false);
    setDeleteError("");
    onDismiss?.();
  };

  return (
    <>
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
            warningText={warningCleared ? undefined : manifestWarningText}
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
          {manifestWarningText && onDeleteManifest && !warningCleared && (
            <Button
              variant="normal"
              onClick={() => setDeleteModalVisible(true)}
            >
              Delete existing manifest
            </Button>
          )}
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
      <Modal
        onDismiss={handleDeleteDismiss}
        visible={deleteModalVisible}
        footer={
          <CancelModalFooter
            onCancel={handleDeleteDismiss}
            onSubmit={handleDeleteManifest}
            submitText="Yes"
            submitLoading={isDeleting}
            cancelDisabled={isDeleting}
          />
        }
        header="Confirmation"
      >
        <SpaceBetween size="xs">
          <TextContent>
            Are you sure you wish to DELETE the existing manifest?
          </TextContent>
          {deleteError && (
            <Alert type="error">{deleteError}</Alert>
          )}
        </SpaceBetween>
      </Modal>
    </>
  );
};

export default HlsIngestModal;
