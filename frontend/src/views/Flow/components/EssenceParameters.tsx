import { Table } from "@cloudscape-design/components";
import type { Flow } from "@/types/tams";
import type { TableProps } from "@cloudscape-design/components";

type FlowWithEssence = Extract<Flow, { essence_parameters: unknown }>;
type EssenceParameters = FlowWithEssence["essence_parameters"];

type Props = {
  essenceParameters?: EssenceParameters;
};

type HierarchicalItem = {
  key: string;
  value?: string | number | boolean;
  children?: HierarchicalItem[];
}

const EssenceParameters = ({ essenceParameters }: Props) => {
  const hierarchicalEssenceParameters = essenceParameters
    ? Object.entries(essenceParameters).map(([key, value]) => ({
      key,
      value: typeof value === "object" && value !== null ? undefined : value,
      children:
        typeof value === "object" && value !== null
          ? Object.entries(value).map(([childKey, childValue]) => ({
              key: childKey,
              value: String(childValue),
            }))
          : undefined,
    }))
    : [];

  const columnDefinitions: TableProps.ColumnDefinition<HierarchicalItem>[] = [
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
  ];


  return essenceParameters ? (
    <Table<HierarchicalItem>
      trackBy="key"
      variant="borderless"
      columnDefinitions={columnDefinitions}
      expandableRows={{
        getItemChildren: (item) => item.children ?? [],
        isItemExpandable: (item) => Boolean(item.children),
        expandedItems: hierarchicalEssenceParameters
          .filter((param) => Boolean(param.children))
          .map((param) => ({ key: param.key })),
        onExpandableItemToggle: () => {},
      }}
      contentDensity="compact"
      items={hierarchicalEssenceParameters}
      sortingDisabled
    />
  ) : (
    "No Essence Parameters"
  );
};

export default EssenceParameters;
