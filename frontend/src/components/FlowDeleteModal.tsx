import { useState } from "react";
import {
  Modal,
  TextContent,
} from "@cloudscape-design/components";
import CancelModalFooter from "@/components/CancelModalFooter";
import useAlertsStore from "@/stores/useAlertsStore";
import { useDelete } from "@/hooks/useFlows";
import type { Flow } from "@/types/tams";

type Props = {
  modalVisible: boolean;
  setModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  selectedItems: readonly Flow[];
};

const FlowDeleteModal = ({
  modalVisible,
  setModalVisible,
  selectedItems,
}: Props) => {
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
        Are you sure you wish to DELETE the selected Flow(s)?
      </TextContent>
    </Modal>
  );
};

export default FlowDeleteModal;
