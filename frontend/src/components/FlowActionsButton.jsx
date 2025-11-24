import { useState } from "react";
import { ButtonDropdown } from "@cloudscape-design/components";
import FlowActionsModal from "@/components/FlowActionsModal";
import { IS_FFMPEG_DEPLOYED } from "@/constants";

const FlowActionsButton = ({ selectedItems }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [actionId, setActionId] = useState("");

  const handleOnClick = ({ detail }) => {
    setActionId(detail.id);
    setModalVisible(true);
  };

  // Build items array conditionally
  const items = [
    {
      text: "Delete",
      id: "delete",
      disabled: !(selectedItems.length > 0),
    },
    {
      text: "Timerange delete",
      id: "timerange",
      disabled: !(selectedItems.length > 0),
    },
  ];

  if (IS_FFMPEG_DEPLOYED) {
    items.push({
      text: "FFmpeg",
      id: "ffmpeg",
      disabled:
        selectedItems.length === 0 ||
        selectedItems.some((item) => !item.container),
      disabledReason:
        selectedItems.some((item) => !item.container) &&
        "The container property must have a value on all selected flows.",
      items: [
        {
          text: "Create FFmpeg Export",
          id: "create-export",
        },
        {
          text: "Create FFmpeg Rule",
          id: "create-rule",
          disabled: selectedItems.length !== 1,
        },
        {
          text: "Create FFmpeg Job",
          id: "create-job",
          disabled: selectedItems.length !== 1,
        },
      ],
    });
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
      <FlowActionsModal
        selectedItems={selectedItems}
        actionId={actionId}
        modalVisible={modalVisible}
        setModalVisible={setModalVisible}
      />
    </>
  );
};

export default FlowActionsButton;
