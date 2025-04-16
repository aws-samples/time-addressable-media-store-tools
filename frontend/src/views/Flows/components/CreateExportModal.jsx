import { useState, useEffect } from "react";
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
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import useStore from "@/stores/useStore";
import { fetchAuthSession } from "aws-amplify/auth";
import { AWS_REGION, AWS_FFMPEG_PARAMETER } from "@/constants";
import { useExportStart } from "@/hooks/useFfmpeg";

const CreateExportModal = ({
  modalVisible,
  setModalVisible,
  selectedFlowIds,
  mutateFlows,
}) => {
  const [commands, setCommands] = useState([]);
  const [timerange, setTimerange] = useState("");
  const [ffmpeg, setFfmpeg] = useState();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { start } = useExportStart();
  const addAlertItem = useStore((state) => state.addAlertItem);
  const delAlertItem = useStore((state) => state.delAlertItem);

  useEffect(() => {
    const fetchCommands = async () => {
      const data = await fetchAuthSession().then((session) =>
        new SSMClient({ region: AWS_REGION, credentials: session.credentials })
          .send(new GetParameterCommand({ Name: AWS_FFMPEG_PARAMETER }))
          .then((response) => JSON.parse(response.Parameter.Value))
      );
      setCommands(
        Object.entries(data).filter(([_, value]) => !value.tams).map(([label, value]) => ({
          label,
          value,
        }))
      );
    };
    fetchCommands();
  }, []);

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
      content: (
        <TextContent>
          <p>The Export is being started...</p>
        </TextContent>
      ),
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
    mutateFlows();
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
