import { useState, useMemo } from "react";
import {
  Box,
  Button,
  Container,
  FormField,
  KeyValuePairs,
  Input,
  Modal,
  Select,
  SpaceBetween,
} from "@cloudscape-design/components";
import stringify from "json-stable-stringify";
import useAlertsStore from "@/stores/useAlertsStore";
import {
  AWS_REPLICATION_CONNECTIONS_PARAMETER,
  AWS_REPLICATION_BATCH_ARN,
  AWS_REPLICATION_CREATE_RULE_ARN,
  AWS_REPLICATION_DELETE_RULE_ARN,
} from "@/constants";
import { useStateMachine } from "@/hooks/useStateMachine";
import { useParameter } from "@/hooks/useParameters";

const ReplicationModal = ({ originType, modalVisible, setModalVisible }) => {
  const [action, setAction] = useState(AWS_REPLICATION_BATCH_ARN);
  const [timerange, setTimerange] = useState("");
  const [originId, setOriginId] = useState("");
  const [originStore, setOriginStore] = useState();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { execute } = useStateMachine();
  const addAlertItem = useAlertsStore((state) => state.addAlertItem);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);
  const { parameter: connectionsData } = useParameter(
    AWS_REPLICATION_CONNECTIONS_PARAMETER
  );

  const actions = [
    {
      label: "One-off Batch Replication",
      value: AWS_REPLICATION_BATCH_ARN,
    },
    {
      label: "Create Live Replication",
      value: AWS_REPLICATION_CREATE_RULE_ARN,
    },
    {
      label: "Delete Live Replication",
      value: AWS_REPLICATION_DELETE_RULE_ARN,
    },
  ];

  const connections = useMemo(() => {
    if (!connectionsData) return [];
    return Object.entries(connectionsData).map(([label, value]) => ({
      label,
      value,
    }));
  }, [connectionsData]);

  const handleDismiss = () => {
    setModalVisible(false);
    setTimerange("");
    setOriginId("");
    setOriginStore();
    setIsSubmitting(false);
  };

  const startExecution = async () => {
    setIsSubmitting(true);
    const id = crypto.randomUUID();
    addAlertItem({
      type: "success",
      dismissible: true,
      dismissLabel: "Dismiss message",
      content: "The requested operation has been submitted...",
      id: id,
      onDismiss: () => delAlertItem(id),
    });
    await execute({
      stateMachineArn: action,
      name: id,
      input: stringify({
        originConnectionArn: originStore.connectionArn,
        originEndpoint: originStore.endpoint,
        [`${originType.toLowerCase()}Id`]: originId,
        timerange: timerange,
      }),
      traceHeader: id,
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
              disabled={!originStore}
              onClick={startExecution}
            >
              Ok
            </Button>
          </SpaceBetween>
        </Box>
      }
      header="Replicate a Flow from another TAMS Store"
    >
      <SpaceBetween size="xs">
        <FormField description="Replication Action">
          <Select
            selectedOption={actions.find(({ value }) => value === action)}
            onChange={({ detail }) => setAction(detail.selectedOption.value)}
            options={actions}
          />
        </FormField>
        <FormField
          description="Choose an Origin TAMS Store"
          label="Origin TAMS Store"
        >
          <Select
            selectedOption={connections.find(
              ({ value }) => value === originStore
            )}
            onChange={({ detail }) =>
              setOriginStore(detail.selectedOption.value)
            }
            options={connections}
          />
        </FormField>
        {originStore && (
          <Container>
            <KeyValuePairs
              columns={1}
              items={[
                {
                  label: "Origin Store Endpoint",
                  value: originStore?.endpoint,
                },
                {
                  label: "Origin Store Connection Arn",
                  value: originStore?.connectionArn,
                },
              ]}
            />
          </Container>
        )}
        <FormField
          description={`Specify the ID for an existing ${originType} to replicate.`}
          label={`Origin ${originType} Id`}
        >
          <Input
            value={originId}
            onChange={({ detail }) => {
              setOriginId(detail.value);
            }}
          />
        </FormField>
        {action === AWS_REPLICATION_BATCH_ARN && (
          <FormField
            description="(Optional) Provide a timerange for the segments to be replicated. Leaving blank will replicate all segments found."
            label="Timerange"
          >
            <Input
              value={timerange}
              onChange={({ detail }) => {
                setTimerange(detail.value);
              }}
            />
          </FormField>
        )}
      </SpaceBetween>
    </Modal>
  );
};

export default ReplicationModal;
