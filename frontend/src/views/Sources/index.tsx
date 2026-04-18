import { useState } from "react";
import {
  Box,
  Button,
  CollectionPreferences,
  CopyToClipboard,
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
import usePreferencesStore from "@/stores/usePreferencesStore";
import ReplicationModal from "@/components/ReplicationModal";
import SourceActionsButton from "@/components/SourceActionsButton";
import { PAGE_SIZE_PREFERENCE, IS_REPLICATION_DEPLOYED } from "@/constants";
import type { Source } from "@/types/tams";
import type { TableProps } from "@cloudscape-design/components";

const columnDefinitions: TableProps.ColumnDefinition<Source>[] = [
  {
    id: "id",
    header: "Id",
    cell: (item) => (
      <>
        <Link to={`/sources/${item.id}`}>{item.id}</Link>
        <CopyToClipboard
          copyButtonAriaLabel="Copy Id"
          copyErrorText="Id failed to copy"
          copySuccessText="Id copied"
          textToCopy={item.id}
          variant="icon"
        />
      </>
    ),
    sortingField: "id",
    isRowHeader: true,
    width: 360,
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
];
const collectionPreferencesProps = {
  pageSizePreference: PAGE_SIZE_PREFERENCE,
  contentDisplayPreference: {
    title: "Column preferences",
    description: "Customize the columns visibility and order.",
    options: columnDefinitions.map(({ id, header }) => ({
      id: id!,
      label: header as string,
      alwaysVisible: id === "id",
    })),
  },
  cancelLabel: "Cancel",
  confirmLabel: "Confirm",
  title: "Preferences",
};

const Sources = () => {
  const preferences = usePreferencesStore((state) => state.sourcesPreferences);
  const setPreferences = usePreferencesStore(
    (state) => state.setSourcesPreferences,
  );
  const showHierarchy = usePreferencesStore(
    (state) => state.sourcesShowHierarchy,
  );
  const setShowHierarchy = usePreferencesStore(
    (state) => state.setSourcesShowHierarchy,
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [actionId, setActionId] = useState("");
  const { sources, isLoading } = useSources();
  const { items, collectionProps, filterProps, paginationProps } =
    useCollection(sources ?? [], {
      expandableRows: showHierarchy
        ? {
            getId: (item) => item.id,
            getParentId: (item) =>
              item.collected_by ? item.collected_by[0] : null,
          }
        : undefined,
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
      sorting: {
        defaultState: {
          sortingColumn: columnDefinitions.find((col) => col.id === "created")!,
          isDescending: true,
        },
      },
      selection: {},
    });
  const { selectedItems } = collectionProps;

  const handleOnClick = ({ detail }: { detail: { id: string } }) => {
    setActionId(detail.id);
    setModalVisible(true);
  };

  return (
    <>
      <Table
        header={
          <Header
            actions={
              <SpaceBetween
                size="xs"
                direction="horizontal"
                alignItems="center"
              >
                {IS_REPLICATION_DEPLOYED && (
                  <Button
                    onClick={() =>
                      handleOnClick({ detail: { id: "replication" } })
                    }
                    disabled={selectedItems?.length !== 0}
                  >
                    Replication
                  </Button>
                )}
                <SourceActionsButton selectedItems={selectedItems ?? []} />
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
        selectionType="single"
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
      {
        {
          replication: (
            <ReplicationModal
              originType="Source"
              modalVisible={modalVisible}
              setModalVisible={setModalVisible}
            />
          ),
        }[actionId]
      }
    </>
  );
};

export default Sources;
