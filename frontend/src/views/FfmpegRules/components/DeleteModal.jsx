import {
  Box,
  Button,
  Modal,
  SpaceBetween,
  TextContent,
} from "@cloudscape-design/components";
import useAlertsStore from "@/stores/useAlertsStore";
import { useDeleteRule } from "@/hooks/useFfmpeg";

const DeleteModal = ({ modalVisible, setModalVisible, selectedKey, setSelectedKey }) => {
  const { del, isDeleting } = useDeleteRule();
  const addAlertItem = useAlertsStore((state) => state.addAlertItem);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);

  const deleteRule = async () => {
    const [flowId, outputFlowId] = selectedKey.split("_");
    const delPromise = del({ flowId, outputFlowId });
    const id = crypto.randomUUID();
    addAlertItem({
      type: "success",
      dismissible: true,
      dismissLabel: "Dismiss message",
      content: "The Rule is being deleted...",
      id: id,
      onDismiss: () => delAlertItem(id),
    });
    await delPromise;
    setModalVisible(false);
    setSelectedKey("");
  };

  return (
    <Modal
      onDismiss={() => setModalVisible(false)}
      visible={modalVisible}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              variant="link"
              disabled={isDeleting}
              onClick={() => setModalVisible(false)}
            >
              No
            </Button>
            <Button variant="primary" loading={isDeleting} onClick={deleteRule}>
              Yes
            </Button>
          </SpaceBetween>
        </Box>
      }
      header="Confirmation"
    >
      <TextContent>Are you sure you wish to DELETE this Rule?</TextContent>
    </Modal>
  );
};

export default DeleteModal;
