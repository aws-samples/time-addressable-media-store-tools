import { useState } from "react";
import {
  FormField,
  Input,
  Modal,
  SpaceBetween,
  TextContent,
} from "@cloudscape-design/components";
import CancelModalFooter from "@/components/CancelModalFooter";
import FfmpegCommandSelector from "@/components/FfmpegCommandSelector";
import { Link } from "react-router-dom";
import useAlertsStore from "@/stores/useAlertsStore";
import { useCreateRule } from "@/hooks/useFfmpeg";
import { useFfmpegCommandSelector } from "@/hooks/useFfmpegCommandSelector";
import createFFmegFlow from "@/utils/createFFmegFlow";
import useAwsCredentials from "@/hooks/useAwsCredentials";
import type { Uuid } from "@/types/tams";

type Props = {
  modalVisible: boolean;
  setModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  selectedFlowId: Uuid;
};

const FlowCreateRuleModal = ({
  modalVisible,
  setModalVisible,
  selectedFlowId,
}: Props) => {
  const [outputFlow, setoutputFlow] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { put } = useCreateRule();
  const addAlertItem = useAlertsStore((state) => state.addAlertItem);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);
  const credentials = useAwsCredentials();
  const { commands, ffmpeg, selectedCommand, setSelectedCommand } =
    useFfmpegCommandSelector(true);

  const handleDismiss = () => {
    setModalVisible(false);
    setoutputFlow("");
    setSelectedCommand("");
    setIsSubmitting(false);
  };

  const createRule = async () => {
    setIsSubmitting(true);
    const destination =
      outputFlow ||
      (await createFFmegFlow(selectedFlowId, ffmpeg!.tams!, credentials));
    const id = crypto.randomUUID();
    addAlertItem({
      type: "success",
      dismissible: true,
      dismissLabel: "Dismiss message",
      content: (
        <TextContent>
          <p>The Rule is being created...</p>
          <p>
            It will ingest into flow{" "}
            <Link to={`/flows/${destination}`}>{destination}</Link>
          </p>
        </TextContent>
      ),
      id: id,
      onDismiss: () => delAlertItem(id),
    });
    await put({
      flowId: selectedFlowId,
      outputFlowId: destination,
      payload: ffmpeg,
    });
    handleDismiss();
  };

  return (
    <Modal
      onDismiss={handleDismiss}
      visible={modalVisible}
      footer={
        <CancelModalFooter
          onCancel={handleDismiss}
          onSubmit={createRule}
          submitText="Create"
          submitDisabled={!ffmpeg}
          submitLoading={isSubmitting}
          cancelDisabled={isSubmitting}
        />
      }
      header="Create FFmpeg Event Rule"
    >
      <SpaceBetween size="xs">
        <FormField
          description="(Optional) Specify the ID for an existing Flow to ingest into. Leave blank to create a new Flow."
          label="Destination"
        >
          <Input
            value={outputFlow}
            onChange={({ detail }) => {
              setoutputFlow(detail.value);
            }}
          />
        </FormField>
        <FfmpegCommandSelector
          commands={commands}
          selectedCommand={selectedCommand}
          setSelectedCommand={setSelectedCommand}
          ffmpeg={ffmpeg}
        />
      </SpaceBetween>
    </Modal>
  );
};

export default FlowCreateRuleModal;
