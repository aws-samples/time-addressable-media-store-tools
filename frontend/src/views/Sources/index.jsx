import {
  Box,
  CollectionPreferences,
  Header,
  Pagination,
  SpaceBetween,
  Table,
  TextFilter,
  Toggle,
} from "@cloudscape-design/components";

import { Link } from "react-router-dom";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { useSources } from "@/hooks/useSources";
import { useState } from "react";
import useStore from "@/stores/useStore";
import { PAGE_SIZE_PREFERENCE } from "@/constants";

const columnDefinitions = [
  {
    id: "id",
    header: "Id",
    cell: (item) => <Link to={`/sources/${item.id}`}>{item.id}</Link>,
    sortingField: "id",
    width: 310,
  },
  {
    id: "format",
    header: "Format",
    cell: (item) => item.format,
    sortingField: "format",
  },
  {
    id: "label",
    header: "Label",
    cell: (item) => item.label,
    sortingField: "label",
  },
  {
    id: "description",
    header: "Description",
    cell: (item) => item.description,
    sortingField: "description",
  },
  {
    id: "created_by",
    header: "Created by",
    cell: (item) => item.created_by,
    sortingField: "created_by",
  },
  {
    id: "updated_by",
    header: "Modified by",
    cell: (item) => item.updated_by,
    sortingField: "updated_by",
  },
  {
    id: "created",
    header: "Created",
    cell: (item) => item.created,
    sortingField: "created",
  },
  {
    id: "updated",
    header: "Updated",
    cell: (item) => item.updated,
    sortingField: "updated",
  },
  {
    id: "tags",
    header: "Tags",
    cell: (item) => item.tags,
    sortingField: "tags",
  },
  {
    id: "source_collection",
    header: "Source collection",
    cell: (item) => item.source_collection,
    sortingField: "source_collection",
  },
  {
    id: "collected_by",
    header: "Collected by",
    cell: (item) => item.collected_by,
    sortingField: "collected_by",
  },
];
const collectionPreferencesProps = {
  pageSizePreference: PAGE_SIZE_PREFERENCE,
  contentDisplayPreference: {
    title: "Column preferences",
    description: "Customize the columns visibility and order.",
    options: columnDefinitions.map(({ id, header }) => ({
      id,
      label: header,
      alwaysVisible: id === "id",
    })),
  },
  cancelLabel: "Cancel",
  confirmLabel: "Confirm",
  title: "Preferences",
};

const Sources = () => {
  const preferences = useStore((state) => state.sourcesPreferences);
  const setPreferences = useStore((state) => state.setSourcesPreferences);
  const showHierarchy = useStore((state) => state.sourcesShowHierarchy);
  const setShowHierarchy = useStore((state) => state.setSourcesShowHierarchy);
  const { sources, isLoading } = useSources();
  const { items, collectionProps, filterProps, paginationProps } =
    useCollection(isLoading ? [] : sources, {
      expandableRows: showHierarchy && {
        getId: (item) => item.id,
        getParentId: (item) =>
          item.collected_by ? item.collected_by[0] : null,
      },
      filtering: {
        empty: (
          <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
            <b>No sources</b>
          </Box>
        ),
        noMatch: (
          <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
            <b>No matches</b>
          </Box>
        ),
      },
      pagination: { pageSize: preferences.pageSize },
      sorting: {},
      selection: {},
    });

  return (
    <Table
      header={
        <Header
          actions={
            <SpaceBetween size="xs" direction="horizontal" alignItems="center">
              <Toggle
                onChange={({ detail }) => setShowHierarchy(detail.checked)}
                checked={showHierarchy}
              >
                Hierarchical View
              </Toggle>
            </SpaceBetween>
          }
        >
          Sources
        </Header>
      }
      {...collectionProps}
      variant="borderless"
      loadingText="Loading resources"
      loading={isLoading}
      trackBy="id"
      columnDefinitions={columnDefinitions}
      columnDisplay={preferences.contentDisplay}
      contentDensity="compact"
      items={items}
      pagination={<Pagination {...paginationProps} />}
      filter={<TextFilter {...filterProps} />}
      preferences={
        <CollectionPreferences
          {...collectionPreferencesProps}
          preferences={preferences}
          onConfirm={({ detail }) => setPreferences(detail)}
        />
      }
    />
  );
};

export default Sources;
