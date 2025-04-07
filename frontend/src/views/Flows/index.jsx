import { AWS_FFMPEG_ENDPOINT, PAGE_SIZE_PREFERENCE } from "@/constants";
import {
  Box,
  Button,
  ButtonDropdown,
  CollectionPreferences,
  Header,
  Pagination,
  SpaceBetween,
  Table,
  TextFilter,
  Toggle,
} from "@cloudscape-design/components";
import DeleteModal from "./components/DeleteModal";
import DeleteTimeRangeModal from "./components/DeleteTimeRangeModal";
import { useFlows } from "@/hooks/useFlows";
import { Link } from "react-router-dom";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { useState } from "react";
import useStore from "@/stores/useStore";
import CreateExportModal from "./components/CreateExportModal";
import CreateRuleModal from "./components/CreateRuleModal";
import CreateJobModal from "./components/CreateJobModal";

const columnDefinitions = [
  {
    id: "id",
    header: "Id",
    cell: (item) => <Link to={`/flows/${item.id}`}>{item.id}</Link>,
    sortingField: "id",
    isRowHeader: true,
    width: 310,
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
    id: "tags",
    header: "Tags",
    cell: (item) => item.tags,
    sortingField: "tags",
  },
  {
    id: "flow_collection",
    header: "Flow collection",
    cell: (item) => item.flow_collection,
    sortingField: "flow_collection",
  },
  {
    id: "collected_by",
    header: "Collected by",
    cell: (item) => item.collected_by,
    sortingField: "collected_by",
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
    id: "segments_updated",
    header: "Segments updated",
    cell: (item) => item.segments_updated,
    sortingField: "segments_updated",
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
      id,
      label: header,
      alwaysVisible: id === "id",
    })),
  },
  cancelLabel: "Cancel",
  confirmLabel: "Confirm",
  title: "Preferences",
};

const Flows = () => {
  const preferences = useStore((state) => state.flowsPreferences);
  const setPreferences = useStore((state) => state.setFlowsPreferences);
  const showHierarchy = useStore((state) => state.flowsShowHierarchy);
  const setShowHierarchy = useStore((state) => state.setFlowsShowHierarchy);
  const { flows, mutate, isLoading, isValidating } = useFlows();
  const [modalVisible, setModalVisible] = useState(false);
  const [actionId, setActionId] = useState("");
  const { items, collectionProps, filterProps, paginationProps, actions } =
    useCollection(isValidating || isLoading ? [] : flows, {
      expandableRows: showHierarchy && {
        getId: (item) => item.id,
        getParentId: (item) =>
          item.collected_by ? item.collected_by[0] : null,
      },
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
      sorting: {},
      selection: {},
    });
  const { selectedItems } = collectionProps;
  const { setSelectedItems } = actions;

  const handleOnClick = ({ detail }) => {
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
                <ButtonDropdown
                  onItemClick={handleOnClick}
                  disabled={selectedItems.length === 0}
                  expandableGroups
                  items={[
                    {
                      text: "Delete",
                      id: "delete",
                      disabled: !(selectedItems.length > 0),
                    },
                    {
                      text: "Timerange delete",
                      id: "timerange",
                      disabled: !(selectedItems.length > 0),
                    },
                    AWS_FFMPEG_ENDPOINT
                      ? {
                          text: "FFmpeg",
                          id: "ffmpeg",
                          disabled:
                            selectedItems.length === 0 ||
                            selectedItems.some((item) => !item.container),
                          disabledReason:
                            selectedItems.some((item) => !item.container) &&
                            "The container property must have a value on all selected flows.",
                          items: [
                            {
                              text: "Create FFmpeg Export",
                              id: "create-export",
                            },
                            {
                              text: "Create FFmpeg Rule",
                              id: "create-rule",
                              disabled: selectedItems.length !== 1,
                            },
                            {
                              text: "Create FFmpeg Job",
                              id: "create-job",
                              disabled: selectedItems.length !== 1,
                            },
                          ],
                        }
                      : {},
                  ]}
                >
                  Actions
                </ButtonDropdown>
                <Button
                  iconName="refresh"
                  variant="link"
                  onClick={mutate}
                  disabled={isValidating || isLoading}
                />
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
        variant="borderless"
        loadingText="Loading resources"
        loading={isValidating || isLoading}
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
          delete: (
            <DeleteModal
              modalVisible={modalVisible}
              setModalVisible={setModalVisible}
              selectedItems={selectedItems}
              mutateFlows={mutate}
            />
          ),
          timerange: (
            <DeleteTimeRangeModal
              modalVisible={modalVisible}
              setModalVisible={setModalVisible}
              selectedItems={selectedItems}
            />
          ),
          "create-export": (
            <CreateExportModal
              modalVisible={modalVisible}
              setModalVisible={setModalVisible}
              selectedFlowIds={selectedItems.map((item) => item.id)}
              mutateFlows={mutate}
            />
          ),
          "create-rule": (
            <CreateRuleModal
              modalVisible={modalVisible}
              setModalVisible={setModalVisible}
              selectedFlowId={
                selectedItems.length > 0 ? selectedItems[0].id : ""
              }
              mutateFlows={mutate}
            />
          ),
          "create-job": (
            <CreateJobModal
              modalVisible={modalVisible}
              setModalVisible={setModalVisible}
              selectedFlowId={
                selectedItems.length > 0 ? selectedItems[0].id : ""
              }
              mutateFlows={mutate}
            />
          ),
        }[actionId]
      }
    </>
  );
};

export default Flows;
