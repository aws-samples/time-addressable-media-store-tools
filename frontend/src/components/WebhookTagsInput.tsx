import { useState } from "react";
import {
    Button,
    FormField,
    Input,
    SpaceBetween,
    Table,
} from "@cloudscape-design/components";
import type { TableProps } from "@cloudscape-design/components";

type TagItem = { key: string; value: string };

type Props = {
    label?: string;
    description: string;
    tags: { [key: string]: string | string[] } | undefined;
    setTags: (
        tags:
            | { [key: string]: string | string[] }
            | undefined
            | ((prev: { [key: string]: string | string[] } | undefined) => { [key: string]: string | string[] } | undefined)
    ) => void;
};

const WebhookTagsInput = ({ label, description, tags, setTags }: Props) => {
    const [newKey, setNewKey] = useState("");
    const [newValue, setNewValue] = useState("");
    const [keyError, setKeyError] = useState("");

    const handleAddTag = () => {
        const trimmedKey = newKey.trim();
        const trimmedValue = newValue.trim();

        if (!trimmedKey) {
            setKeyError("Key is required");
            return;
        }

        // Convert comma-separated string to array, single value stays as string
        const tagValue = trimmedValue.includes(",")
            ? trimmedValue.split(",").map((s) => s.trim())
            : trimmedValue;

        const updatedTags = {
            ...(tags || {}),
            [trimmedKey]: tagValue,
        };

        setTags(updatedTags);
        setNewKey("");
        setNewValue("");
        setKeyError("");
    };

    const handleRemoveTag = (key: string) => {
        if (!tags) return;
        const updatedTags = { ...tags };
        delete updatedTags[key];
        setTags(Object.keys(updatedTags).length > 0 ? updatedTags : undefined);
    };

    // Convert arrays to comma-separated strings for display
    const renderValue = (value: string | string[]) => {
        return [value].flat().join(",");
    };

    const columnDefinitions: TableProps.ColumnDefinition<TagItem>[] = [
        {
            id: "key",
            header: "Key",
            cell: (item) => item.key,
            isRowHeader: true,
        },
        {
            id: "value",
            header: "Value",
            cell: (item) => item.value,
        },
        {
            id: "delete",
            header: "",
            cell: (item) => (
                <Button
                    iconName="remove"
                    variant="icon"
                    onClick={() => handleRemoveTag(item.key)}
                />
            ),
            width: 32,
        },
    ];

    const items: TagItem[] = tags
        ? Object.entries(tags).map(([key, value]) => ({
            key,
            value: renderValue(value),
        }))
        : [];

    return (
        <FormField
            description={description}
            label={label}
            errorText={keyError}
        >
            <SpaceBetween size="xs">
                {items.length > 0 && (
                    <Table
                        variant="borderless"
                        columnDefinitions={columnDefinitions}
                        contentDensity="compact"
                        items={items}
                        trackBy="key"
                    />
                )}
                <SpaceBetween size="xs" direction="horizontal" alignItems="end">
                    <FormField label="Key">
                        <Input
                            value={newKey}
                            onChange={({ detail }) => {
                                setNewKey(detail.value);
                                if (keyError) setKeyError("");
                            }}
                            onKeyDown={(e) => {
                                if (e.detail.key === "Enter") {
                                    e.preventDefault();
                                    handleAddTag();
                                }
                            }}
                            placeholder="tag-key"
                        />
                    </FormField>
                    <FormField label="Value">
                        <Input
                            value={newValue}
                            onChange={({ detail }) => setNewValue(detail.value)}
                            onKeyDown={(e) => {
                                if (e.detail.key === "Enter") {
                                    e.preventDefault();
                                    handleAddTag();
                                }
                            }}
                            placeholder="tag-value or val1,val2,val3"
                        />
                    </FormField>
                    <Button onClick={handleAddTag} disabled={!newKey.trim()}>
                        Add
                    </Button>
                </SpaceBetween>
            </SpaceBetween>
        </FormField>
    );
};

export default WebhookTagsInput;
