import SourceCreateExportModal from "@/components/SourceCreateExportModal";
import type { Source } from "@/types/tams";

type Props = {
  selectedItems: readonly Source[],
  actionId: string,
  modalVisible: boolean,
  setModalVisible: React.Dispatch<React.SetStateAction<boolean>>,
}
const SourceActionsModal = ({
  selectedItems,
  actionId,
  modalVisible,
  setModalVisible,
}: Props) => {
  return {
    "create-export": (
      <SourceCreateExportModal
        modalVisible={modalVisible}
        setModalVisible={setModalVisible}
        selectedSourceId={selectedItems.length > 0 ? selectedItems[0].id : ""}
      />
    ),
  }[actionId];
};

export default SourceActionsModal;
