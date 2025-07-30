import { FormField, Select } from "@cloudscape-design/components";

const OperationSelector = ({ operations, selectedOperation, onChange }) => {
  const selectedOption = operations.find(
    (op) => op.value === selectedOperation
  );

  return (
    <FormField label="Operation">
      <Select
        selectedOption={selectedOption}
        onChange={({ detail }) => onChange(detail.selectedOption.value)}
        options={operations}
      />
    </FormField>
  );
};

export default OperationSelector;
