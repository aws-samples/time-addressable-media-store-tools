import FlowReadOnlyModal from "@/components/FlowReadOnlyModal";
import FlowDeleteModal from "@/components/FlowDeleteModal";
import FlowDeleteTimeRangeModal from "@/components/FlowDeleteTimeRangeModal";
import FlowCreateExportModal from "@/components/FlowCreateExportModal";
import FlowCreateRuleModal from "@/components/FlowCreateRuleModal";
import FlowCreateJobModal from "@/components/FlowCreateJobModal";
import type { Flow } from "@/types/tams";

type Props = {
  selectedItems: readonly Flow[],
  actionId: string,
  modalVisible: boolean,
  setModalVisible: React.Dispatch<React.SetStateAction<boolean>>,
}

const FlowActionsModal = ({
  selectedItems,
  actionId,
  modalVisible,
  setModalVisible,
}: Props) => {
  return {
    "read-only": (
      <FlowReadOnlyModal
        modalVisible={modalVisible}
        setModalVisible={setModalVisible}
        selectedItems={selectedItems}
      />
    ),
    delete: (
      <FlowDeleteModal
        modalVisible={modalVisible}
        setModalVisible={setModalVisible}
        selectedItems={selectedItems}
      />
    ),
    timerange: (
      <FlowDeleteTimeRangeModal
        modalVisible={modalVisible}
        setModalVisible={setModalVisible}
        selectedItems={selectedItems}
      />
    ),
    "create-export": (
      <FlowCreateExportModal
        modalVisible={modalVisible}
        setModalVisible={setModalVisible}
        selectedFlowIds={selectedItems.map((item) => item.id)}
      />
    ),
    "create-rule": (
      <FlowCreateRuleModal
        modalVisible={modalVisible}
        setModalVisible={setModalVisible}
        selectedFlowId={selectedItems.length > 0 ? selectedItems[0].id : ""}
      />
    ),
    "create-job": (
      <FlowCreateJobModal
        modalVisible={modalVisible}
        setModalVisible={setModalVisible}
        selectedFlowId={selectedItems.length > 0 ? selectedItems[0].id : ""}
      />
    ),
  }[actionId];
};

export default FlowActionsModal;
