import { Link } from "react-router-dom";
import { Table } from "@cloudscape-design/components";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { useSourceFlows } from "@/hooks/useSources";

const FlowsTab = ({ sourceId }) => {
  const { flows, isLoading: loadingFlows } = useSourceFlows(sourceId);

  const columnDefinitions = [
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
  ]

  const { items, collectionProps } = useCollection(
    flows ?? [],
    {
      sorting: {},
    }
  );

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
