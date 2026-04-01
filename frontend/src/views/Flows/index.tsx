import { useState } from "react";
import { PAGE_SIZE_PREFERENCE, IS_REPLICATION_DEPLOYED } from "@/constants";
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
import { useFlows } from "@/hooks/useFlows";
import { Link } from "react-router-dom";
import { useCollection } from "@cloudscape-design/collection-hooks";
import usePreferencesStore from "@/stores/usePreferencesStore";
import ReplicationModal from "@/components/ReplicationModal";
import FlowActionsButton from "@/components/FlowActionsButton";
import type { Uuid, Flow } from "@/types/tams";
import type { TableProps } from "@cloudscape-design/components";
import type { NonCancelableCustomEvent } from "@cloudscape-design/components";

const columnDefinitions: TableProps.ColumnDefinition<Flow>[] = [
  {
    id: "id",
    header: "Id",
    cell: (item) => (
      <>
        <Link to={`/flows/${item.id}`}>{item.id}</Link>
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
    id: "format",
    header: "Format",
    cell: (item) => item.format,
    sortingField: "format",
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
    id: "source_id",
    header: "Source id",
    cell: (item) => item.source_id,
    sortingField: "source_id",
  },
  {
    id: "metadata_version",
    header: "Metadata version",
    cell: (item) => item.metadata_version,
    sortingField: "metadata_version",
  },
  {
    id: "generation",
    header: "Generation",
    cell: (item) => item.generation,
    sortingField: "generation",
  },
  {
    id: "metadata_updated",
    header: "Metadata updated",
    cell: (item) => item.metadata_updated,
    sortingField: "metadata_updated",
  },
  {
    id: "read_only",
    header: "Read only",
    cell: (item) => item.read_only,
    sortingField: "read_only",
  },
  {
    id: "codec",
    header: "Codec",
    cell: (item) => item.codec,
    sortingField: "codec",
  },
  {
    id: "container",
    header: "Container",
    cell: (item) => item.container,
    sortingField: "container",
  },
  {
    id: "avg_bit_rate",
    header: "Avg bit rate",
    cell: (item) => item.avg_bit_rate,
    sortingField: "avg_bit_rate",
  },
  {
    id: "max_bit_rate",
    header: "Max bit rate",
    cell: (item) => item.max_bit_rate,
    sortingField: "max_bit_rate",
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

const Flows = () => {
  const preferences = usePreferencesStore((state) => state.flowsPreferences);
  const setPreferences = usePreferencesStore(
    (state) => state.setFlowsPreferences,
  );
  const showHierarchy = usePreferencesStore(
    (state) => state.flowsShowHierarchy,
  );
  const setShowHierarchy = usePreferencesStore(
    (state) => state.setFlowsShowHierarchy,
  );
  const { flows, isLoading } = useFlows();
  const [modalVisible, setModalVisible] = useState(false);
  const [actionId, setActionId] = useState("");
  const { items, collectionProps, filterProps, paginationProps } =
    useCollection(flows ?? [], {
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
            <b>No flows</b>
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
          sortingColumn: columnDefinitions.find(({ id }) => id === "created")!,
          isDescending: true,
        },
      },
      selection: {},
    });
  const { selectedItems } = collectionProps;

  // Cascade selection to immediate children
  const handleSelectionChange = (
    event: NonCancelableCustomEvent<TableProps.SelectionChangeDetail<Flow>>,
  ) => {
    if (!showHierarchy) {
      collectionProps.onSelectionChange?.(event);
      return;
    }
    const newSelection = event.detail.selectedItems;
    const previousIds = new Set(
      selectedItems?.map((item: Flow) => item.id) ?? [],
    );
    const newIds = new Set(newSelection.map((item: Flow) => item.id));
    const added = newSelection.filter(
      (item: Flow) => !previousIds.has(item.id),
    );
    const removedIds = [...previousIds].filter((id: Uuid) => !newIds.has(id));
    let result = [...newSelection];
    // Add children of newly selected parents
    added.forEach((parent: Flow) => {
      const children = (flows ?? []).filter(
        (f) => f.collected_by && f.collected_by[0] === parent.id,
      );
      children.forEach((child) => {
        if (!result.some((item) => item.id === child.id)) {
          result.push(child);
        }
      });
    });

    // Remove children of deselected parents
    removedIds.forEach((parentId) => {
      result = result.filter(
        (item) => !(item.collected_by && item.collected_by[0] === parentId),
      );
    });

    collectionProps.onSelectionChange?.({
      ...event,
      detail: { ...event.detail, selectedItems: result },
    });
  };

  const handleOnClick = ({ detail }: { detail: { id: Uuid } }) => {
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
                <FlowActionsButton selectedItems={selectedItems ?? []} />
                <Toggle
                  onChange={({ detail }) => setShowHierarchy(detail.checked)}
                  checked={showHierarchy}
                >
                  Hierarchical View
                </Toggle>
              </SpaceBetween>
            }
          >
            Flows
          </Header>
        }
        {...collectionProps}
        onSelectionChange={handleSelectionChange}
        variant="borderless"
        loadingText="Loading resources"
        loading={isLoading}
        trackBy="id"
        selectionType="multi"
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
              originType="Flow"
              modalVisible={modalVisible}
              setModalVisible={setModalVisible}
            />
          ),
        }[actionId]
      }
    </>
  );
};

export default Flows;
