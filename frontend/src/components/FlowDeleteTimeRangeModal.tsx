import { useState } from "react";
import { FormField, Input, Modal } from "@cloudscape-design/components";
import CancelModalFooter from "@/components/CancelModalFooter";
import useAlertsStore from "@/stores/useAlertsStore";
import { useDeleteTimerange } from "@/hooks/useFlows";
import type { Flow } from "@/types/tams";

type Props = {
  modalVisible: boolean;
  setModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  selectedItems: readonly Flow[];
};

const FlowDeleteTimeRangeModal = ({
  modalVisible,
  setModalVisible,
  selectedItems,
}: Props) => {
  const { delTimerange, isDeletingTimerange } = useDeleteTimerange();
  const addAlertItems = useAlertsStore((state) => state.addAlertItems);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);
  const [timerange, setTimerange] = useState("");

  const deleteTimerange = async () => {
    try {
      await Promise.all(
        selectedItems.map((item) =>
          delTimerange({ flowId: item.id, timerange }),
        ),
      );
      const id = crypto.randomUUID();
      addAlertItems(
        selectedItems.map((flow, n) => ({
          type: "success",
          dismissible: true,
          dismissLabel: "Dismiss message",
          content: `Flow segments on flow ${flow.id} within the timerange ${timerange} are being deleted. This will happen asynchronously.`,
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
    setModalVisible(false);
    setTimerange("");
  };

  return (
    <Modal
      onDismiss={handleDismiss}
      visible={modalVisible}
      footer={
        <CancelModalFooter
          onCancel={handleDismiss}
          onSubmit={deleteTimerange}
          submitText="Delete"
          submitLoading={isDeletingTimerange}
          cancelDisabled={isDeletingTimerange}
        />
      }
      header="Confirmation"
    >
      <FormField
        description="Provide a timerange for the segments to be deleted."
        label="Timerange"
      >
        <Input
          value={timerange}
          onChange={({ detail }) => {
            setTimerange(detail.value);
          }}
        />
      </FormField>
    </Modal>
  );
};

export default FlowDeleteTimeRangeModal;
