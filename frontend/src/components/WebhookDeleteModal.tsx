import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal, TextContent } from "@cloudscape-design/components";
import CancelModalFooter from "@/components/CancelModalFooter";
import useAlertsStore from "@/stores/useAlertsStore";
import { useDelete } from "@/hooks/useWebhooks";
import type { WebhookGet } from "@/types/tams";

type Props = {
  modalVisible: boolean;
  setModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  selectedItems: readonly WebhookGet[];
};

const WebhookDeleteModal = ({
  modalVisible,
  setModalVisible,
  selectedItems,
}: Props) => {
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);
  const { del } = useDelete();
  const addAlertItems = useAlertsStore((state) => state.addAlertItems);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);

  const deleteFlow = async () => {
    setIsDeleting(true);
    try {
      await Promise.all(
        selectedItems.map((item) => del({ webhookId: item.id })),
      );
      const id = crypto.randomUUID();
      addAlertItems(
        selectedItems.map((webhook, n) => ({
          type: "success",
          dismissible: true,
          dismissLabel: "Dismiss message",
          content: `Webhook ${webhook.id} is being deleted. This will happen asynchronously`,
          id: `${id}-${n}`,
          onDismiss: () => delAlertItem(`${id}-${n}`),
        })),
      );
    } catch {
      // Alert emitted by useApi
    } finally {
      handleDismiss();
    }
  };

  const handleDismiss = () => {
    setIsDeleting(false);
    setModalVisible(false);
    navigate("/webhooks");
  };

  return (
    <Modal
      onDismiss={handleDismiss}
      visible={modalVisible}
      footer={
        <CancelModalFooter
          onCancel={handleDismiss}
          onSubmit={deleteFlow}
          submitText="Yes"
          submitLoading={isDeleting}
          cancelDisabled={isDeleting}
        />
      }
      header="Confirmation"
    >
      <TextContent>
        Are you sure you wish to DELETE the selected Webhooks(s)?
      </TextContent>
    </Modal>
  );
};

export default WebhookDeleteModal;
