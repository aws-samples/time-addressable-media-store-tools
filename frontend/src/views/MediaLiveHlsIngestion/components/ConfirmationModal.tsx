import { Modal, TextContent } from "@cloudscape-design/components";
import CancelModalFooter from "@/components/CancelModalFooter";
import useAlertsStore from "@/stores/useAlertsStore";
import { useChannelStart, useChannelStop } from "@/hooks/useChannels";
import type { ChannelIngestion } from "@/types/ingestHls";

type Props = {
  modalVisible: boolean;
  setModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  channelId: string | undefined;
  setSelectedItem: React.Dispatch<
    React.SetStateAction<ChannelIngestion | undefined>
  >;
  actionId: string;
  setActionId: React.Dispatch<React.SetStateAction<string>>;
};

const ConfirmationModal = ({
  modalVisible,
  setModalVisible,
  channelId,
  setSelectedItem,
  actionId,
  setActionId,
}: Props) => {
  const { start, isStarting } = useChannelStart();
  const { stop, isStopping } = useChannelStop();
  const addAlertItem = useAlertsStore((state) => state.addAlertItem);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);

  const handleDismiss = () => {
    setModalVisible(false);
    setSelectedItem(undefined);
    setActionId("");
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
    setSelectedItem(undefined);
    setActionId("");
  };

  return (
    <Modal
      onDismiss={handleDismiss}
      visible={modalVisible}
      footer={
        <CancelModalFooter
          onCancel={handleDismiss}
          onSubmit={performAction}
          submitText="Yes"
          submitLoading={isStarting || isStopping}
          cancelDisabled={isStarting || isStopping}
        />
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
