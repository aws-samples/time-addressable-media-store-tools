import { useState } from "react";
import {
  Checkbox,
  FormField,
  Input,
  Modal,
  SpaceBetween,
} from "@cloudscape-design/components";
import CancelModalFooter from "@/components/CancelModalFooter";
import { useUpdate } from "@/hooks/useTags";
import { useTagPropagation } from "@/hooks/useTagPropagation";
import type { Flow, Source, TagName } from "@/types/tams";

type Props = {
  modalVisible: boolean;
  setModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  entityType: string;
  entity: Flow | Source;
};

const TagAddModal = ({
  modalVisible,
  setModalVisible,
  entityType,
  entity,
}: Props) => {
  const [tagName, setTagName] = useState<TagName>("");
  const [tagValue, setTagValue] = useState("");
  const [propagate, setPropagate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { update } = useUpdate(entityType, entity.id);
  const { propagateTagAction } = useTagPropagation();

  const handleConfirm = async () => {
    setIsLoading(true);
    await update({
      name: tagName,
      value: tagValue.includes(",")
        ? tagValue.split(",").map((s) => s.trim())
        : tagValue,
    });
    if (propagate) {
      await propagateTagAction(entityType, entity, "update", tagName, tagValue);
    }
    handleDismiss();
  };

  const handleDismiss = () => {
    setTagName("");
    setTagValue("");
    setPropagate(false);
    setIsLoading(false);
    setModalVisible(false);
  };

  return (
    <Modal
      onDismiss={handleDismiss}
      visible={modalVisible}
      header="Add tag"
      footer={
        <CancelModalFooter
          onCancel={handleDismiss}
          onSubmit={handleConfirm}
          submitText="Add"
          submitLoading={isLoading}
          cancelDisabled={isLoading}
        />
      }
    >
      <SpaceBetween size="xs">
        <FormField description="Provide a name for the tag." label="Name">
          <Input
            value={tagName}
            onChange={({ detail }) => setTagName(detail.value)}
          />
        </FormField>
        <FormField description="Provide a value for the tag." label="Value">
          <Input
            value={tagValue}
            onChange={({ detail }) => setTagValue(detail.value)}
          />
        </FormField>
        <Checkbox
          checked={propagate}
          onChange={({ detail }) => setPropagate(detail.checked)}
        >
          Propagate
        </Checkbox>
      </SpaceBetween>
    </Modal>
  );
};

export default TagAddModal;
