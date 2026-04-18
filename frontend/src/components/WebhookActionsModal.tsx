import WebhookRegisterUpdateModal from "@/components/WebhookRegisterUpdateModal";
import WebhookDeleteModal from "@/components/WebhookDeleteModal";
import type { WebhookGet } from "@/types/tams";

type Props = {
  selectedItems: readonly WebhookGet[];
  actionId: string;
  modalVisible: boolean;
  setModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
};

const WebhookActionsModal = ({
  selectedItems,
  actionId,
  modalVisible,
  setModalVisible,
}: Props) => {
  return {
    update: (
      <WebhookRegisterUpdateModal
        modalVisible={modalVisible}
        setModalVisible={setModalVisible}
        webhook={selectedItems[0]}
      />
    ),
    delete: (
      <WebhookDeleteModal
        modalVisible={modalVisible}
        setModalVisible={setModalVisible}
        selectedItems={selectedItems}
      />
    ),
  }[actionId];
};

export default WebhookActionsModal;
