import { useState } from "react";
import {
  Container,
  FormField,
  KeyValuePairs,
  Input,
  Modal,
  Select,
  SpaceBetween,
} from "@cloudscape-design/components";
import CancelModalFooter from "@/components/CancelModalFooter";
import stringify from "json-stable-stringify";
import useAlertsStore from "@/stores/useAlertsStore";
import {
  AWS_REPLICATION_BATCH_ARN,
  AWS_REPLICATION_CREATE_RULE_ARN,
  AWS_REPLICATION_DELETE_RULE_ARN,
} from "@/constants";
import { useStateMachine } from "@/hooks/useStateMachine";
import { useReplicationConnectionSelector } from "@/hooks/useReplicationConnectionSelector";

type Props = {
  originType: string;
  modalVisible: boolean;
  setModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
};

const ReplicationModal = ({
  originType,
  modalVisible,
  setModalVisible,
}: Props) => {
  const [action, setAction] = useState(AWS_REPLICATION_BATCH_ARN);
  const [timerange, setTimerange] = useState("");
  const [originId, setOriginId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { execute } = useStateMachine();
  const addAlertItem = useAlertsStore((state) => state.addAlertItem);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);
  const { connections, connection, selectedConnection, setSelectedConnection } =
    useReplicationConnectionSelector();

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

  const startExecution = async () => {
    setIsSubmitting(true);
    try {
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
          originConnectionArn: connection!.connectionArn,
          originEndpoint: connection!.endpoint,
          [`${originType.toLowerCase()}Id`]: originId,
          timerange: timerange,
        }),
        traceHeader: id,
      });
    } catch {
      // Alert emitted by useApi
    } finally {
      handleDismiss();
    }
  };

  const handleDismiss = () => {
    setModalVisible(false);
    setTimerange("");
    setOriginId("");
    setSelectedConnection("");
    setIsSubmitting(false);
  };

  return (
    <Modal
      onDismiss={handleDismiss}
      visible={modalVisible}
      footer={
        <CancelModalFooter
          onCancel={handleDismiss}
          onSubmit={startExecution}
          submitText="Ok"
          submitDisabled={!connection}
          submitLoading={isSubmitting}
          cancelDisabled={isSubmitting}
        />
      }
      header="Replicate a Flow from another TAMS Store"
    >
      <SpaceBetween size="xs">
        <FormField description="Replication Action">
          <Select
            selectedOption={
              actions.find(({ value }) => value === action) ?? null
            }
            onChange={({ detail }) =>
              setAction(detail.selectedOption.value ?? "")
            }
            options={actions}
          />
        </FormField>
        <FormField
          description="Choose an Origin TAMS Store"
          label="Origin TAMS Store"
        >
          <Select
            selectedOption={
              connections.find(({ value }) => value === selectedConnection) ??
              null
            }
            onChange={({ detail }) =>
              setSelectedConnection(detail.selectedOption.value ?? "")
            }
            options={connections}
          />
        </FormField>
        {connection && (
          <Container>
            <KeyValuePairs
              columns={1}
              items={[
                {
                  label: "Origin Store Endpoint",
                  value: connection.endpoint,
                },
                {
                  label: "Origin Store Connection Arn",
                  value: connection.connectionArn,
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
