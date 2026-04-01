import { useState } from "react";
import { ButtonDropdown } from "@cloudscape-design/components";
import FlowActionsModal from "@/components/FlowActionsModal";
import { IS_FFMPEG_DEPLOYED } from "@/constants";
import type { Flow } from "@/types/tams";
import type { ButtonDropdownProps } from "@cloudscape-design/components";

type MenuItem = ButtonDropdownProps.Item | ButtonDropdownProps.ItemGroup;

const FlowActionsButton = ({
  selectedItems,
}: {
  selectedItems: readonly Flow[];
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [actionId, setActionId] = useState("");

  const handleOnClick = ({
    detail,
  }: {
    detail: ButtonDropdownProps.ItemClickDetails;
  }) => {
    setActionId(detail.id);
    setModalVisible(true);
  };

  // Build items array conditionally
  const items: MenuItem[] = [
    {
      text: "Set Read Only",
      id: "read-only",
      disabled: !(selectedItems.length > 0),
    },
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
      disabledReason: selectedItems.some((item) => !item.container)
        ? "The container property must have a value on all selected flows."
        : undefined,
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
