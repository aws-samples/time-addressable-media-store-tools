import { useState } from "react";
import {
  Box,
  Button,
  FormField,
  Input,
  Modal,
  SpaceBetween,
} from "@cloudscape-design/components";
import useAlertsStore from "@/stores/useAlertsStore";
import { useDeleteTimerange } from "@/hooks/useFlows";

const DeleteTimeRangeModal = ({
  modalVisible,
  setModalVisible,
  selectedItems,
}) => {
  const { delTimerange, isDeletingTimerange } = useDeleteTimerange();
  const addAlertItems = useAlertsStore((state) => state.addAlertItems);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);
  const [timerange, setTimerange] = useState("");

  const deleteTimerange = async () => {
    const promises = selectedItems.map((item) =>
      delTimerange({ flowId: item.id, timerange })
    );
    const id = crypto.randomUUID();
    addAlertItems(
      selectedItems.map((flow, n) => ({
        type: "success",
        dismissible: true,
        dismissLabel: "Dismiss message",
        content: `Flow segments on flow ${flow.id} within the timerange ${timerange} are being deleted. This will happen asynchronously.`,
        id: `${id}-${n}`,
        onDismiss: () => delAlertItem(`${id}-${n}`),
      }))
    );
    await Promise.all(promises);
    setModalVisible(false);
    setTimerange("");
  };

  const handleDismiss = () => {
    setModalVisible(false);
    setTimerange("");
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
              disabled={isDeletingTimerange}
              onClick={handleDismiss}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={isDeletingTimerange}
              onClick={deleteTimerange}
            >
              Delete
            </Button>
          </SpaceBetween>
        </Box>
      }
      header="Confirmation"
    >
      <FormField
        description="Provide a timerange for the segments to be deleted."
        label="Timerange"
      >
        <Input
          value={timerange}
          onChange={({ detail }) => {
            setTimerange(detail.value);
          }}
        />
      </FormField>
    </Modal>
  );
};

export default DeleteTimeRangeModal;
