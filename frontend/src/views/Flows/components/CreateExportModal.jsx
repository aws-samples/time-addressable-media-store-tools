import { useState, useMemo } from "react";
import {
  Box,
  Button,
  FormField,
  KeyValuePairs,
  Input,
  Modal,
  Select,
  SpaceBetween,
} from "@cloudscape-design/components";
import useAlertsStore from "@/stores/useAlertsStore";
import { AWS_FFMPEG_COMMANDS_PARAMETER } from "@/constants";
import { useExportStart } from "@/hooks/useFfmpeg";
import { useParameter } from "@/hooks/useParameters";

const CreateExportModal = ({
  modalVisible,
  setModalVisible,
  selectedFlowIds,
}) => {
  const [timerange, setTimerange] = useState("");
  const [ffmpeg, setFfmpeg] = useState();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { start } = useExportStart();
  const addAlertItem = useAlertsStore((state) => state.addAlertItem);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);
  const { parameter: commandsData } = useParameter(AWS_FFMPEG_COMMANDS_PARAMETER);

  const commands = useMemo(() => {
    if (!commandsData) return [];
    return Object.entries(commandsData)
      .filter(([_, value]) => !value.tams)
      .map(([label, value]) => ({ label, value }));
  }, [commandsData]);

  const handleDismiss = () => {
    setModalVisible(false);
    setTimerange("");
    setFfmpeg();
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
      id: id,
      onDismiss: () => delAlertItem(id),
    });
    await start({
      timerange: timerange,
      flowIds: selectedFlowIds,
      ffmpeg: { command: ffmpeg.command },
    });
    handleDismiss();
    setIsSubmitting(false);
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
              disabled={isSubmitting}
              onClick={handleDismiss}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={isSubmitting}
              disabled={!ffmpeg}
              onClick={createJob}
            >
              Create
            </Button>
          </SpaceBetween>
        </Box>
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
        <FormField
          description="Choose an FFmpeg command"
          label="FFmpeg Command"
        >
          <Select
            selectedOption={commands.find(({ value }) => value === ffmpeg)}
            onChange={({ detail }) => setFfmpeg(detail.selectedOption.value)}
            options={commands}
          />
        </FormField>
        {ffmpeg && (
          <KeyValuePairs
            columns={1}
            items={[
              {
                label: "Command",
                value: Object.entries(ffmpeg?.command).map((arg) => arg.join(" ")).join(" "),
              },
            ]}
          />
        )}
      </SpaceBetween>
    </Modal>
  );
};

export default CreateExportModal;
