import { Modal, TextContent } from "@cloudscape-design/components";
import type { Job } from "@aws-sdk/client-mediaconvert";

type Props = {
  modalVisible: boolean,
  setModalVisible: React.Dispatch<React.SetStateAction<boolean>>,
  selectedItem: Job | undefined,
}

const JobDetailModal = ({ modalVisible, setModalVisible, selectedItem }: Props) => {
  const handleDismiss = async () => {
    setModalVisible(false);
  };

  return (
    <Modal
      onDismiss={handleDismiss}
      visible={modalVisible}
      header="Job Details"
    >
      <TextContent>
        <code style={{ whiteSpace: "pre-wrap", overflowWrap: "break-word" }}>{JSON.stringify(selectedItem, null, 2)}</code>
      </TextContent>
    </Modal>
  );
};

export default JobDetailModal;
