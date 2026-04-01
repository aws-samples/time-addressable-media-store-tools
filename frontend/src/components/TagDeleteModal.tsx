import { useState } from "react";
import {
  Checkbox,
  Modal,
  SpaceBetween,
  TextContent,
} from "@cloudscape-design/components";
import CancelModalFooter from "@/components/CancelModalFooter";
import { useDelete } from "@/hooks/useTags";
import { useTagPropagation } from "@/hooks/useTagPropagation";
import type { Flow, Source, TagName } from "@/types/tams";

type Props = {
  modalVisible: boolean;
  setModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  entityType: string;
  entity: Flow | Source;
  tagName: TagName;
};

const TagDeleteModal = ({
  modalVisible,
  setModalVisible,
  entityType,
  entity,
  tagName,
}: Props) => {
  const [propagate, setPropagate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { del } = useDelete(entityType, entity.id);
  const { propagateTagAction } = useTagPropagation();

  const handleConfirm = async () => {
    setIsLoading(true);
    await del({ name: tagName });
    if (propagate) {
      await propagateTagAction(entityType, entity, "delete", tagName);
    }
    handleDismiss();
  };

  const handleDismiss = () => {
    setPropagate(false);
    setIsLoading(false);
    setModalVisible(false);
  };

  return (
    <Modal
      onDismiss={handleDismiss}
      visible={modalVisible}
      header="Delete tag"
      footer={
        <CancelModalFooter
          onCancel={handleDismiss}
          onSubmit={handleConfirm}
          submitText="Yes"
          submitLoading={isLoading}
          cancelDisabled={isLoading}
        />
      }
    >
      <SpaceBetween size="xs">
        <TextContent>
          Are you sure you wish to delete the {tagName} tag?
        </TextContent>
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

export default TagDeleteModal;
