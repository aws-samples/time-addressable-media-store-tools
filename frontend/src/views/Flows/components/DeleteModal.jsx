import { useState } from "react";
import {
  Box,
  Button,
  Modal,
  SpaceBetween,
  TextContent,
} from "@cloudscape-design/components";
import useAlertsStore from "@/stores/useAlertsStore";
import { useDelete } from "@/hooks/useFlows";

const DeleteModal = ({
  modalVisible,
  setModalVisible,
  selectedItems,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const { del } = useDelete();
  const addAlertItems = useAlertsStore((state) => state.addAlertItems);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);

  const deleteFlow = async () => {
    setIsDeleting(true);
    const promises = selectedItems.map((item) => del({ flowId: item.id }));
    const id = crypto.randomUUID();
    addAlertItems(
      selectedItems.map((flow, n) => ({
        type: "success",
        dismissible: true,
        dismissLabel: "Dismiss message",
        content: `Flow ${flow.id} is being deleted. This will happen asynchronously`,
        id: `${id}-${n}`,
        onDismiss: () => delAlertItem(`${id}-${n}`),
      }))
    );
    await Promise.all(promises);
    setIsDeleting(false);
    setModalVisible(false);
  };

  const handleDismiss = () => {
    setModalVisible(false);
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
              disabled={isDeleting}
              onClick={handleDismiss}
            >
              No
            </Button>
            <Button variant="primary" loading={isDeleting} onClick={deleteFlow}>
              Yes
            </Button>
          </SpaceBetween>
        </Box>
      }
      header="Confirmation"
    >
      <TextContent>
        Are you sure you wish to DELETE the selected Flow(s)?
      </TextContent>
    </Modal>
  );
};

export default DeleteModal;
