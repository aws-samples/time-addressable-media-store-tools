import { useState } from "react";
import { FormField, Input } from "@cloudscape-design/components";
import { isValidUuid } from "@/utils/validateUuid";

type Props = {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  onCommit?: (value: string) => void;
  placeholder?: string;
};

const UuidInput = ({
  label,
  description,
  value,
  onChange,
  onCommit,
  placeholder,
}: Props) => {
  const [error, setError] = useState("");

  const validate = () => {
    if (!value) {
      setError("");
      return;
    }
    if (isValidUuid(value)) {
      setError("");
      onCommit?.(value);
    } else {
      setError("Invalid Id format, must be a valid UUID");
    }
  };

  return (
    <FormField label={label} description={description} errorText={error}>
      <Input
        value={value}
        onChange={({ detail }) => {
          onChange(detail.value);
          if (error) setError("");
        }}
        onKeyDown={(e) => {
          if (e.detail.key === "Enter") {
            e.preventDefault();
            validate();
          }
        }}
        onBlur={validate}
        placeholder={placeholder}
      />
    </FormField>
  );
};

export default UuidInput;