import { useState } from "react";
import { ButtonDropdown } from "@cloudscape-design/components";
import SourceActionsModal from "@/components/SourceActionsModal";
import { IS_MEDIACONVERT_DEPLOYED } from "@/constants";

const SourceActionsButton = ({ selectedItems }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [actionId, setActionId] = useState("");

  const handleOnClick = ({ detail }) => {
    setActionId(detail.id);
    setModalVisible(true);
  };

  // Build items array conditionally
  const items = [];

  if (IS_MEDIACONVERT_DEPLOYED) {
    items.push({
      text: "Create MediaConvert Job",
      id: "create-export",
      disabled: selectedItems.length !== 1,
    });
  }

  // Don't render if no actions available
  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <ButtonDropdown
        onItemClick={handleOnClick}
        disabled={selectedItems.length === 0}
        expandableGroups
        items={items}
      >
        Actions
      </ButtonDropdown>
      <SourceActionsModal
        selectedItems={selectedItems}
        actionId={actionId}
        modalVisible={modalVisible}
        setModalVisible={setModalVisible}
      />
    </>
  );
};

export default SourceActionsButton;
