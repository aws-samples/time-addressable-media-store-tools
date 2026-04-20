import { Modal, TextContent } from "@cloudscape-design/components";
import CancelModalFooter from "@/components/CancelModalFooter";

type Props = {
  modalVisible: boolean;
  setModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  laneName: string;
  onConfirm: () => void;
};

const DeleteModal = ({
  modalVisible,
  setModalVisible,
  laneName,
  onConfirm,
}: Props) => {
  const handleConfirm = () => {
    onConfirm();
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
          onSubmit={handleConfirm}
          submitText="Yes"
        />
      }
      header="Delete Segmentation Lane"
    >
      <TextContent>
        Are you sure you want to delete the segmentation lane {laneName}? This
        action cannot be undone.
      </TextContent>
    </Modal>
  );
};

export default DeleteModal;
