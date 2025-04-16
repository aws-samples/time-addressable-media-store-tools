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
import { Link } from "react-router-dom";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import useStore from "@/stores/useStore";
import { fetchAuthSession } from "aws-amplify/auth";
import { AWS_REGION, AWS_FFMPEG_PARAMETER } from "@/constants";
import { useJobStart } from "@/hooks/useFfmpeg";
import createFFmegFlow from "@/utils/createFFmegFlow";

const CreateJobModal = ({
  modalVisible,
  setModalVisible,
  selectedFlowId,
  mutateFlows,
}) => {
  const [commands, setCommands] = useState([]);
  const [timerange, setTimerange] = useState("");
  const [outputFlow, setoutputFlow] = useState("");
  const [ffmpeg, setFfmpeg] = useState();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { start } = useJobStart();
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
        Object.entries(data)
          .filter(([_, value]) => value.tams)
          .map(([label, value]) => ({
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
    setoutputFlow("");
    setFfmpeg();
    setIsSubmitting(false);
  };

  const createJob = async () => {
    setIsSubmitting(true);
    const destination =
      outputFlow || (await createFFmegFlow(selectedFlowId, ffmpeg.tams));
    const id = crypto.randomUUID();
    addAlertItem({
      type: "success",
      dismissible: true,
      dismissLabel: "Dismiss message",
      content: (
        <TextContent>
          <p>The Batch Job is being started...</p>
          <p>
            It will ingest into flow{" "}
            <Link to={`/flows/${destination}`}>{destination}</Link>
          </p>
        </TextContent>
      ),
      id: id,
      onDismiss: () => delAlertItem(id),
    });
    await start({
      inputFlow: selectedFlowId,
      sourceTimerange: timerange,
      ffmpeg: { command: ffmpeg.command },
      outputFlow: destination,
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
      header="Create FFmpeg Batch Job"
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

export default CreateJobModal;
