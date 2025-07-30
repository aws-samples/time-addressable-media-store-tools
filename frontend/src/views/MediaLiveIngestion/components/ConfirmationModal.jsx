import {
  Box,
  Button,
  Modal,
  SpaceBetween,
  TextContent,
} from "@cloudscape-design/components";
import useAlertsStore from "@/stores/useAlertsStore";
import { useChannelStart, useChannelStop } from "@/hooks/useChannels";

const ConfirmationModal = ({
  modalVisible,
  setModalVisible,
  channelId,
  setSelectedItem,
  actionId,
  setActionId,
}) => {
  const { start, isStarting } = useChannelStart();
  const { stop, isStopping } = useChannelStop();
  const addAlertItem = useAlertsStore((state) => state.addAlertItem);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);

  const handleDismiss = () => {
    setModalVisible(false);
    setSelectedItem();
    setActionId();
  };

  const performAction = async () => {
    if (actionId === "start") {
      await start({ ChannelId: channelId });
    } else if (actionId === "stop") {
      await stop({ ChannelId: channelId });
    }
    const id = crypto.randomUUID();
    addAlertItem({
      type: "success",
      dismissible: true,
      dismissLabel: "Dismiss message",
      content: `The channel ${channelId} is being ${actionId}ed...`,
      id: id,
      onDismiss: () => delAlertItem(id),
    });
    setModalVisible(false);
    setSelectedItem();
    setActionId();
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
              disabled={isStarting || isStopping}
              onClick={handleDismiss}
            >
              No
            </Button>
            <Button
              variant="primary"
              loading={isStarting || isStopping}
              onClick={performAction}
            >
              Yes
            </Button>
          </SpaceBetween>
        </Box>
      }
      header="Confirmation"
    >
      <TextContent>
        Are you sure you wish to {actionId.toUpperCase()} the Channel?
      </TextContent>
    </Modal>
  );
};

export default ConfirmationModal;
