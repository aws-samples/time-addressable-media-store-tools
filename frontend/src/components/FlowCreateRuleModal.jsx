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
  TextContent,
} from "@cloudscape-design/components";
import { Link } from "react-router-dom";
import useAlertsStore from "@/stores/useAlertsStore";
import { AWS_FFMPEG_COMMANDS_PARAMETER } from "@/constants";
import { useCreateRule } from "@/hooks/useFfmpeg";
import createFFmegFlow from "@/utils/createFFmegFlow";
import { useParameter } from "@/hooks/useParameters";
import useAwsCredentials from "@/hooks/useAwsCredentials";

const FlowCreateRuleModal = ({
  modalVisible,
  setModalVisible,
  selectedFlowId,
}) => {
  const [outputFlow, setoutputFlow] = useState("");
  const [ffmpeg, setFfmpeg] = useState();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { put } = useCreateRule();
  const addAlertItem = useAlertsStore((state) => state.addAlertItem);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);
  const { parameter: commandsData } = useParameter(AWS_FFMPEG_COMMANDS_PARAMETER);
  const credentials = useAwsCredentials();

  const commands = useMemo(() => {
    if (!commandsData) return [];
    return Object.entries(commandsData)
      .filter(([_, value]) => value.tams)
      .map(([label, value]) => ({ label, value }));
  }, [commandsData]);

  const handleDismiss = () => {
    setModalVisible(false);
    setoutputFlow("");
    setFfmpeg();
  };

  const createRule = async () => {
    setIsSubmitting(true);
    const destination =
      outputFlow || (await createFFmegFlow(selectedFlowId, ffmpeg.tams, credentials));
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
              onClick={createRule}
            >
              Create
            </Button>
          </SpaceBetween>
        </Box>
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

export default FlowCreateRuleModal;
