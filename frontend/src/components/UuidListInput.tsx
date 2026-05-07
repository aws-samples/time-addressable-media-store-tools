import { useState } from "react";
import { SpaceBetween, TokenGroup } from "@cloudscape-design/components";
import UuidInput from "@/components/UuidInput";
import type { Uuid } from "@/types/tams";

type Props = {
  label: string;
  description: string;
  uuids: Uuid[] | undefined;
  setUuids: React.Dispatch<React.SetStateAction<Uuid[] | undefined>>;
};

const UuidListInput = ({ label, description, uuids, setUuids }: Props) => {
  const [buffer, setBuffer] = useState("");
  const uuidList = uuids ?? [];

  return (
    <SpaceBetween size="xs">
      <UuidInput
        label={label}
        description={description}
        value={buffer}
        onChange={setBuffer}
        onCommit={(uuid) => {
          if (uuid) {
            setUuids([...uuidList, uuid]);
            setBuffer("");
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
  );
};

export default UuidListInput;
