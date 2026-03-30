import { Link } from "react-router-dom";
import { Table } from "@cloudscape-design/components";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { FlowCollection, CollectionItem } from "@/types/tams"
import type { TableProps } from "@cloudscape-design/components";

type Props = {
  entityType: string,
  collection: FlowCollection,
}

const Collection = ({ entityType, collection }: Props) => {
  const columnDefinitions: TableProps.ColumnDefinition<CollectionItem>[] = [
    {
      id: "id",
      header: "Id",
      cell: (item) => <Link to={`/${entityType}/${item.id}`}>{item.id}</Link>,
      isRowHeader: true,
      sortingField: "id",
    },
    {
      id: "role",
      header: "Role",
      cell: (item) => item.role,
      sortingField: "role",
    },
  ]

  const { items, collectionProps } = useCollection(
    collection ?? [],
    {
      sorting: {},
    }
  );

  return collection ? (
    <Table
      {...collectionProps}
      trackBy="id"
      variant="borderless"
      columnDefinitions={columnDefinitions}
      contentDensity="compact"
      items={items}
    />
  ) : (
    `No ${entityType} collection(s)`
  );
};

export default Collection;
