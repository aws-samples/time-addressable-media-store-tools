import {
  Button,
  Input,
  Link,
  SpaceBetween,
  Table,
  TextContent,
} from "@cloudscape-design/components";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { useUpdate } from "@/hooks/useTags";
import TagAddModal from "./TagAddModal";
import TagDeleteModal from "./TagDeleteModal";
import { useState } from "react";
import type { Flow, Source, TagName } from "@/types/tams";
import type { TableProps } from "@cloudscape-design/components";

type TagItem = { key: TagName; value: string };

type Props = {
  entityType: string;
  entity: Flow | Source;
};

const isUrl = (text: string) => {
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const Tags = ({ entityType, entity }: Props) => {
  const { update } = useUpdate(entityType, entity.id);
  const [modalVisible, setModalVisible] = useState(false);
  const [actionId, setActionId] = useState("");
  const [tagName, setTagName] = useState<TagName>("");

  const handleAdd = () => {
    setActionId("add");
    setModalVisible(true);
  };

  const handleDelete = (tagKey: TagName) => {
    setActionId("delete");
    setTagName(tagKey);
    setModalVisible(true);
  };

  const columnDefinitions: TableProps.ColumnDefinition<TagItem>[] = [
    {
      id: "key",
      header: "Key",
      cell: (item) => item.key,
      isRowHeader: true,
      sortingField: "key",
    },
    {
      id: "value",
      header: "Value",
      cell: (item) => {
        if (isUrl(item.value)) {
          return (
            <Link href={item.value} external>
              {item.value}
            </Link>
          );
        }
        return item.value;
      },
      sortingField: "value",
      editConfig: {
        editingCell: (
          item,
          {
            currentValue,
            setValue,
          }: {
            currentValue: string | undefined;
            setValue: (value: string) => void;
          },
        ) => {
          return (
            <Input
              autoFocus
              value={currentValue ?? item.value}
              onChange={({ detail }) => setValue(detail.value)}
            />
          );
        },
      },
    },
    {
      id: "delete",
      header: "",
      cell: (item) => (
        <Button
          iconName="remove"
          variant="icon"
          onClick={() => handleDelete(item.key)}
        />
      ),
      width: 32,
    },
  ];

  const { items, collectionProps } = useCollection(
    entity.tags
      ? Object.entries(entity.tags).map(([key, value]) => ({
          key,
          value: [value].flat().join(","),
        }))
      : [],
    { sorting: {} },
  );

  return (
    <>
      <SpaceBetween size="xs">
        {entity.tags ? (
          <Table
            {...collectionProps}
            trackBy="key"
            variant="borderless"
            columnDefinitions={columnDefinitions}
            contentDensity="compact"
            items={items}
            submitEdit={async (
              item: TagItem,
              _: TableProps.ColumnDefinition<TagItem>,
              newValue: unknown,
            ) => {
              const value = newValue as string;
              await update({
                name: item.key,
                value: value.includes(",")
                  ? value.split(",").map((s) => s.trim())
                  : value,
              });
            }}
          />
        ) : (
          <TextContent>No tags</TextContent>
        )}
        <Button iconName="add-plus" variant="normal" onClick={handleAdd}>
          Add Tag
        </Button>
      </SpaceBetween>
      {
        {
          add: (
            <TagAddModal
              modalVisible={modalVisible}
              setModalVisible={setModalVisible}
              entityType={entityType}
              entity={entity}
            />
          ),
          delete: (
            <TagDeleteModal
              modalVisible={modalVisible}
              setModalVisible={setModalVisible}
              entityType={entityType}
              entity={entity}
              tagName={tagName}
            />
          ),
        }[actionId]
      }
    </>
  );
};

export default Tags;
