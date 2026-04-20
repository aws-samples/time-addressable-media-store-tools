import {
  Badge,
  ColumnLayout,
  SpaceBetween,
  StatusIndicator,
  CopyToClipboard,
} from "@cloudscape-design/components";
import { Link } from "react-router-dom";
import ValueWithLabel from "@/components/ValueWithLabel";
import EditableField from "@/components/EditableField";
import { DATE_FORMAT, STATUS_MAPPINGS } from "@/constants";
import chunkArray from "@/utils/chunkArray";
import { parseTimerangeDateTime } from "@/utils/timerange";
import { Flow, Source, WebhookGet } from "@/types/tams";

type Props = {
  entityType: string;
  entity: Source | Flow | WebhookGet;
};

const excludedFields = [
  "source_collection",
  "flow_collection",
  "collected_by",
  "essence_parameters",
  "tags",
  "flow_ids",
  "source_ids",
  "flow_collected_by_ids",
  "source_collected_by_ids",
  "error",
];

const editableFields = ["label", "description"];

const EntityDetails = ({ entityType, entity }: Props) => {
  if (!entity) return null;

  const processEntityData = (entity: Source | Flow | WebhookGet) => {
    const filteredEntity = Object.entries(entity).filter(
      ([key]) => !excludedFields.includes(key),
    );

    // Separate primitive and object values
    const keyValues = filteredEntity.filter(
      ([key, value]) => typeof value !== "object" && key !== "timerange",
    );

    // Add stringified object values (but not arrays)
    filteredEntity
      .filter(([, value]) => typeof value === "object" && !Array.isArray(value))
      .forEach(([key, value]) => keyValues.push([key, JSON.stringify(value)]));

    // Add arrays as-is (don't stringify)
    filteredEntity
      .filter(([, value]) => Array.isArray(value))
      .forEach(([key, value]) => keyValues.push([key, value]));

    // Add timerange fields
    if ("timerange" in entity && entity.timerange) {
      keyValues.push(["timerange", entity.timerange]);
      if (entity.timerange !== "()") {
        const { start, end } = parseTimerangeDateTime(entity.timerange);
        keyValues.push(
          ["timerange_start", start?.toLocaleString(DATE_FORMAT)],
          ["timerange_end", end?.toLocaleString(DATE_FORMAT)],
        );
      }
    }

    // Move id to the front if it exists
    const idEntry = keyValues.find(([key]) => key === "id");
    if (idEntry) {
      const otherEntries = keyValues.filter(([key]) => key !== "id");
      return [idEntry, ...otherEntries];
    }

    return keyValues;
  };

  const renderFieldValue = (
    label: string,
    value: string | number | boolean | undefined | string[],
  ) => {
    if (editableFields.includes(label)) {
      return (
        <EditableField
          entityType={entityType}
          entityId={entity.id}
          field={label}
          value={value as string}
        >
          {value}
        </EditableField>
      );
    }

    // Handle special cases
    if (label === "source_id") {
      return <Link to={`/sources/${value}`}>{value}</Link>;
    }

    if (
      label === "accept_get_urls" &&
      Array.isArray(value) &&
      value.length === 0
    ) {
      return <Badge color="severity-neutral">Empty list</Badge>;
    }

    if (label === "status" && typeof value === "string") {
      return (
        <StatusIndicator type={STATUS_MAPPINGS[value]}>{value}</StatusIndicator>
      );
    }

    if (label === "events" && Array.isArray(value) && value.length === 0) {
      return <Badge color="severity-neutral">No Events</Badge>;
    }

    if (Array.isArray(value)) {
      return (
        <ul style={{ margin: 0 }}>
          {value.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      );
    }

    if (typeof value === "boolean") {
      return value.toString();
    }

    return (
      <>
        {value}
        {label === "id" && entityType !== "webhooks" && (
          <CopyToClipboard
            copyButtonAriaLabel="Copy Id"
            copyErrorText="Id failed to copy"
            copySuccessText="Id copied"
            textToCopy={String(value)}
            variant="icon"
          />
        )}
      </>
    );
  };

  const keyValues = processEntityData(entity);
  const keyValueColumns = chunkArray(keyValues, 2);

  return (
    <ColumnLayout columns={2} variant="text-grid">
      {keyValueColumns.map((chunk, index) => (
        <SpaceBetween key={index} size="l">
          {chunk.map(([label, value]) => (
            <ValueWithLabel key={label} label={label}>
              {renderFieldValue(label, value)}
            </ValueWithLabel>
          ))}
        </SpaceBetween>
      ))}
    </ColumnLayout>
  );
};

export default EntityDetails;
