import { FormField, Select } from "@cloudscape-design/components";
import type { SelectProps } from "@cloudscape-design/components";

type Props = {
  operations: SelectProps.Option[],
  selectedOperation: string,
  onChange: (operation: string) => void,
};

const OperationSelector = ({ operations, selectedOperation, onChange }: Props) => {
  const selectedOption = operations.find(
    (op) => op.value === selectedOperation
  );

  return (
    <FormField label="Operation">
      <Select
        selectedOption={selectedOption ?? null}
        onChange={({ detail }) => onChange(detail.selectedOption.value ?? "")}
        options={operations}
      />
    </FormField>
  );
};

export default OperationSelector;
