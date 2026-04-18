import { useState } from "react";
import {
  FormField,
  Input,
  RadioGroup,
  SpaceBetween,
  TokenGroup,
} from "@cloudscape-design/components";

type Props = {
  label: string;
  description: string;
  values: string[] | undefined;
  setValues: React.Dispatch<React.SetStateAction<string[] | undefined>>;
};

const WebhookAcceptGetUrlsInput = ({
  label,
  description,
  values,
  setValues,
}: Props) => {
  const [inputValue, setInputValue] = useState("");
  const [mode, setMode] = useState<"notset" | "set">(
    values === undefined ? "notset" : "set"
  );

  return (
    <FormField description={description} label={label}>
      <SpaceBetween size="s">
        <RadioGroup
          value={mode}
          onChange={({ detail }) => {
            const newMode = detail.value as "notset" | "set";
            setMode(newMode);
            if (newMode === "notset") {
              setValues(undefined);
            } else {
              setValues([]);
            }
          }}
          items={[
            { value: "notset", label: "Not set" },
            { value: "set", label: "Set (leave empty to exclude all)" },
          ]}
        />
        {mode === "set" && (
          <SpaceBetween size="xs">
            <Input
              value={inputValue}
              onChange={({ detail }) => setInputValue(detail.value)}
              onKeyDown={(e) => {
                if (e.detail.key === "Enter") {
                  e.preventDefault();
                  if (inputValue) {
                    setValues([...(values || []), inputValue]);
                    setInputValue("");
                  }
                }
              }}
              onBlur={() => {
                if (inputValue) {
                  setValues([...(values || []), inputValue]);
                  setInputValue("");
                }
              }}
              placeholder="Enter value and press Enter"
            />
            {values && values.length > 0 && (
              <TokenGroup
                items={values.map((val) => ({
                  label: val,
                  dismissLabel: `Remove ${val}`,
                }))}
                onDismiss={({ detail }) => {
                  setValues(values.filter((_, i) => i !== detail.itemIndex));
                }}
              />
            )}
          </SpaceBetween>
        )}
      </SpaceBetween>
    </FormField>
  );
};

export default WebhookAcceptGetUrlsInput;
