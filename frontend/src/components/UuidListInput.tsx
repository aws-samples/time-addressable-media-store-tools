import { useState } from "react";
import {
  FormField,
  Input,
  SpaceBetween,
  TokenGroup,
} from "@cloudscape-design/components";
import type { Uuid } from "@/types/tams";

type Props = {
  label: string;
  description: string;
  uuids: Uuid[] | undefined;
  setUuids: React.Dispatch<React.SetStateAction<Uuid[] | undefined>>;
};

const isValidUuid = (str: string) => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

const UuidListInput = ({ label, description, uuids, setUuids }: Props) => {
  const [uuidInput, setUuidInput] = useState("");
  const [uuidError, setUuidError] = useState("");

  // Default to empty array if undefined
  const uuidList = uuids ?? [];

  return (
    <FormField description={description} label={label} errorText={uuidError}>
      <SpaceBetween size="xs">
        <Input
          value={uuidInput}
          onChange={({ detail }) => {
            setUuidInput(detail.value);
            if (uuidError) setUuidError("");
          }}
          onKeyDown={(e) => {
            if (e.detail.key === "Enter") {
              e.preventDefault();
              if (isValidUuid(uuidInput)) {
                setUuids([...uuidList, uuidInput]);
                setUuidInput("");
                setUuidError("");
              } else if (uuidInput) {
                setUuidError("Invalid Id format, must be a valid UUID");
              }
            }
          }}
          onBlur={() => {
            if (uuidInput) {
              if (isValidUuid(uuidInput)) {
                setUuids([...uuidList, uuidInput]);
                setUuidInput("");
                setUuidError("");
              } else {
                setUuidError("Invalid Id format, must be a valid UUID");
              }
            }
          }}
          placeholder="Enter Id and press Enter"
        />
        {uuidList.length > 0 && (
          <TokenGroup
            items={uuidList.map((id) => ({
              label: id,
              dismissLabel: `Remove ${id}`,
            }))}
            onDismiss={({ detail }) => {
              setUuids(uuidList.filter((_, i) => i !== detail.itemIndex));
            }}
          />
        )}
      </SpaceBetween>
    </FormField>
  );
};

export default UuidListInput;
