import { useState } from "react";
import { ButtonDropdown } from "@cloudscape-design/components";
import WebhookActionsModal from "@/components/WebhookActionsModal";
import type { WebhookGet } from "@/types/tams";
import type { ButtonDropdownProps } from "@cloudscape-design/components";

type MenuItem = ButtonDropdownProps.Item | ButtonDropdownProps.ItemGroup;

const WebhookActionsButton = ({
  selectedItems,
}: {
  selectedItems: readonly WebhookGet[];
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
      text: "Update",
      id: "update",
      disabled: selectedItems.length !== 1,
    },
    {
      text: "Delete",
      id: "delete",
      disabled: !(selectedItems.length > 0),
    },
  ];

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
      <WebhookActionsModal
        selectedItems={selectedItems}
        actionId={actionId}
        modalVisible={modalVisible}
        setModalVisible={setModalVisible}
      />
    </>
  );
};

export default WebhookActionsButton;
