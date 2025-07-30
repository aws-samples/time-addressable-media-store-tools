import { FormField, Multiselect } from "@cloudscape-design/components";

const FlowSelector = ({ flows, selectedFlows, onChange }) => {
  const flowOptions =
    flows?.map((flow) => ({
      label: flow.description ?? flow.label,
      value: flow.id,
      tags: [flow.format],
    })) ?? [];

  return (
    <FormField label="Flows">
      <Multiselect
        selectedOptions={selectedFlows}
        onChange={({ detail }) => onChange(detail.selectedOptions)}
        options={flowOptions}
        placeholder="Select Flows"
        inlineTokens
      />
    </FormField>
  );
};

export default FlowSelector;
