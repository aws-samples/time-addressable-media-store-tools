import { Modal, TextContent } from "@cloudscape-design/components";
import CancelModalFooter from "@/components/CancelModalFooter";
import useAlertsStore from "@/stores/useAlertsStore";
import { useDeleteRule } from "@/hooks/useFfmpeg";

type Props = {
  modalVisible: boolean,
  setModalVisible: React.Dispatch<React.SetStateAction<boolean>>,
  selectedKey: string,
  setSelectedKey: React.Dispatch<React.SetStateAction<string>>,
}

const DeleteModal = ({ modalVisible, setModalVisible, selectedKey, setSelectedKey }: Props) => {
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
        <CancelModalFooter
          onCancel={() => setModalVisible(false)}
          onSubmit={deleteRule}
          submitText="Yes"
          submitLoading={isDeleting}
          cancelDisabled={isDeleting}
        />
      }
      header="Confirmation"
    >
      <TextContent>Are you sure you wish to DELETE this Rule?</TextContent>
    </Modal>
  );
};

export default DeleteModal;
