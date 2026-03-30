import { useState } from "react";
import { Input, Button, SpaceBetween } from "@cloudscape-design/components";
import { useUpdateField } from "@/hooks/useUpdateField";
import type { Uuid } from "@/types/tams"
import type { InputProps } from "@cloudscape-design/components";

type Props = {
  entityType: string,
  entityId: Uuid,
  field: string,
  value: string,
  children: React.ReactNode
}

const EditableField = ({ entityType, entityId, field, value, children }: Props) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const { update, isUpdating } = useUpdateField(entityType, entityId);

  const handleEdit = () => {
    setIsEditing(true);
    setEditValue(value || "");
  };

  const handleSave = async () => {
    await update({ field, value: editValue });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleKeyDown = ({ detail }: { detail: InputProps.KeyDetail }) => {
    if (detail.key === "Enter") handleSave();
    if (detail.key === "Escape") handleCancel();
  };

  return (
    <SpaceBetween direction="horizontal" size="xs" alignItems="center">
      {isEditing ? (
        <SpaceBetween direction="horizontal" size="xs" alignItems="center">
          <Input
            value={editValue}
            onChange={({ detail }) => setEditValue(detail.value)}
            onKeyDown={handleKeyDown}
            disabled={isUpdating}
            autoFocus
          />
          <Button
            variant="inline-icon"
            iconName="close"
            onClick={handleCancel}
            disabled={isUpdating}
          />
          <Button
            variant="inline-icon"
            iconName="check"
            onClick={handleSave}
            loading={isUpdating}
          />
        </SpaceBetween>
      ) : (
        <SpaceBetween direction="horizontal" size="xs" alignItems="center">
          <div onClick={handleEdit} style={{ cursor: "pointer", flex: 1 }}>
            {children}
          </div>
          <Button variant="icon" iconName="edit" onClick={handleEdit} />
        </SpaceBetween>
      )}
    </SpaceBetween>
  );
};

export default EditableField;
