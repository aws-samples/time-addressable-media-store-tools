import { useState } from "react";
import {
  FormField,
  Input,
  Modal,
  SpaceBetween,
} from "@cloudscape-design/components";
import CancelModalFooter from "@/components/CancelModalFooter";
import FfmpegCommandSelector from "@/components/FfmpegCommandSelector";
import useAlertsStore from "@/stores/useAlertsStore";
import { useExportStart } from "@/hooks/useFfmpeg";
import { useFfmpegCommandSelector } from "@/hooks/useFfmpegCommandSelector";
import type { Uuid } from "@/types/tams";

type Props = {
  modalVisible: boolean,
  setModalVisible: React.Dispatch<React.SetStateAction<boolean>>,
  selectedFlowIds: Uuid[],
}

const FlowCreateExportModal = ({
  modalVisible,
  setModalVisible,
  selectedFlowIds,
}: Props) => {
  const [timerange, setTimerange] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { start } = useExportStart();
  const addAlertItem = useAlertsStore((state) => state.addAlertItem);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);
  const { commands, ffmpeg, selectedCommand, setSelectedCommand } = useFfmpegCommandSelector(false);

  const handleDismiss = () => {
    setModalVisible(false);
    setTimerange("");
    setSelectedCommand("");
    setIsSubmitting(false);
  };

  const createJob = async () => {
    setIsSubmitting(true);
    const id = crypto.randomUUID();
    addAlertItem({
      type: "success",
      dismissible: true,
      dismissLabel: "Dismiss message",
      content: "The Export is being started...",
      id,
      onDismiss: () => delAlertItem(id),
    });
    await start({
      timerange: timerange,
      flowIds: selectedFlowIds,
      ffmpeg: { command: ffmpeg!.command },
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
          onSubmit={createJob}
          submitText="Create"
          submitDisabled={!ffmpeg}
          submitLoading={isSubmitting}
          cancelDisabled={isSubmitting}
        />
      }
      header="Create FFmpeg Export Job"
    >
      <SpaceBetween size="xs">
        <FormField
          description="(Optional) Provide a timerange for the segments to processed."
          label="Timerange"
        >
          <Input
            value={timerange}
            onChange={({ detail }) => {
              setTimerange(detail.value);
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

export default FlowCreateExportModal;
