import { Link } from "react-router-dom";
import { Table } from "@cloudscape-design/components";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { useSourceFlows } from "@/hooks/useSources";
import { Uuid, Flow } from "@/types/tams";
import type { TableProps } from "@cloudscape-design/components";

const FlowsTab = ({ sourceId }: { sourceId: Uuid }) => {
  const { flows, isLoading: loadingFlows } = useSourceFlows(sourceId);

  const columnDefinitions: TableProps.ColumnDefinition<Flow>[] = [
    {
      id: "id",
      header: "Id",
      cell: (item) => <Link to={`/flows/${item.id}`}>{item.id}</Link>,
      isRowHeader: true,
      sortingField: "id",
    },
    {
      id: "description",
      header: "Description",
      cell: (item) => item.description,
      sortingField: "description",
    },
  ];

  const { items, collectionProps } = useCollection(flows ?? [], {
    sorting: {},
  });

  return flows ? (
    <Table
      {...collectionProps}
      trackBy="id"
      variant="borderless"
      columnDefinitions={columnDefinitions}
      contentDensity="compact"
      items={items}
      loading={loadingFlows}
      loadingText="Loading segments..."
    />
  ) : (
    "No flows"
  );
};

export default FlowsTab;
