import { FormField, Multiselect } from "@cloudscape-design/components";
import type { Flow } from "@/types/tams";
import type { MultiselectProps } from "@cloudscape-design/components";

type Props = {
  flows: Flow[];
  selectedFlows: readonly MultiselectProps.Option[];
  onChange: (selectedOptions: readonly MultiselectProps.Option[]) => void;
};

const FlowSelector = ({ flows, selectedFlows, onChange }: Props) => {
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
