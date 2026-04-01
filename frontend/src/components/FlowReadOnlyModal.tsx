import { useState } from "react";
import { FormField, RadioGroup, Modal } from "@cloudscape-design/components";
import CancelModalFooter from "@/components/CancelModalFooter";
import useAlertsStore from "@/stores/useAlertsStore";
import { usePutReadOnly } from "@/hooks/useFlows";
import type { Flow } from "@/types/tams";

type Props = {
  modalVisible: boolean;
  setModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  selectedItems: readonly Flow[];
};

const FlowReadOnlyModal = ({
  modalVisible,
  setModalVisible,
  selectedItems,
}: Props) => {
  const { putReadOnly, isPuttingReadOnly } = usePutReadOnly();
  const addAlertItems = useAlertsStore((state) => state.addAlertItems);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);
  const [readOnlyStr, setReadOnlyStr] = useState("");

  const setReadOnly = async () => {
    const promises = selectedItems.map((item) =>
      putReadOnly({ flowId: item.id, readOnly: readOnlyStr === "true" }),
    );
    const id = crypto.randomUUID();
    addAlertItems(
      selectedItems.map((flow, n) => ({
        type: "success",
        dismissible: true,
        dismissLabel: "Dismiss message",
        content: `Flow ${flow.id} read_only is being updated. This will happen asynchronously`,
        id: `${id}-${n}`,
        onDismiss: () => delAlertItem(`${id}-${n}`),
      })),
    );
    setModalVisible(false);
    setReadOnlyStr("");
    await Promise.all(promises);
  };

  const handleDismiss = () => {
    setModalVisible(false);
    setReadOnlyStr("");
  };

  return (
    <Modal
      onDismiss={handleDismiss}
      visible={modalVisible}
      footer={
        <CancelModalFooter
          onCancel={handleDismiss}
          onSubmit={setReadOnly}
          submitText="Apply"
          submitLoading={isPuttingReadOnly}
          cancelDisabled={isPuttingReadOnly}
        />
      }
      header="Set Read-Only Status"
    >
      <FormField
        description="Set the read-only status for the selected flow(s)."
        label="Read Only"
      >
        <RadioGroup
          onChange={({ detail }) => setReadOnlyStr(detail.value)}
          value={readOnlyStr}
          items={[
            { value: "true", label: "True" },
            { value: "false", label: "False" },
          ]}
        />
      </FormField>
    </Modal>
  );
};

export default FlowReadOnlyModal;
