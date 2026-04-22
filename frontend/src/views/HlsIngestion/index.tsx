import { useState } from "react";
import { PAGE_SIZE_PREFERENCE } from "@/constants";
import {
  Box,
  Button,
  CollectionPreferences,
  Header,
  Pagination,
  Table,
  TextFilter,
} from "@cloudscape-design/components";
import { Link } from "react-router-dom";
import StartIngestModal from "./components/StartIngestModal";
import WorkflowStatus from "./components/WorkflowStatus";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { useWorkflows } from "@/hooks/useStateMachine";
import type { Workflow } from "@/types/ingestHls";
import type { TableProps } from "@cloudscape-design/components";
import usePreferencesStore from "@/stores/usePreferencesStore";

const HlsIngestion = () => {
  const { workflows, isLoading } = useWorkflows();
  const [modalVisible, setModalVisible] = useState(false);
  const preferences = usePreferencesStore(
    (state) => state.hlsIngestPreferences,
  );
  const setPreferences = usePreferencesStore(
    (state) => state.setHlsIngestPreferences,
  );

  const columnDefinitions: TableProps.ColumnDefinition<Workflow>[] = [
    {
      id: "elementalService",
      header: "Origin",
      cell: (item) => item.elementalService,
      sortingField: "elementalService",
    },
    {
      id: "elementalId",
      header: "Id",
      cell: (item) => item.elementalId,
      sortingField: "elementalId",
      isRowHeader: true,
    },
    {
      id: "status",
      header: "Status",
      cell: (item) => <WorkflowStatus item={item} />,
      sortingField: "status",
    },
    {
      id: "startDate",
      header: "Start",
      cell: (item) => item.startDate,
      sortingField: "startDate",
    },
    {
      id: "stopDate",
      header: "Stop",
      cell: (item) => item.stopDate,
      sortingField: "stopDate",
    },
    {
      id: "flowId",
      header: "Multi Flow Id",
      cell: (item) => item.flowId && <Link to={`/flows/${item.flowId}`}>{item.flowId}</Link>,
      sortingField: "flowId",
      width: 360,
    },
    {
      id: "sourceId",
      header: "Multi Source Id",
      cell: (item) => item.sourceId && <Link to={`/sources/${item.sourceId}`}>{item.sourceId}</Link>,
      sortingField: "sourceId",
      width: 360,
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
        alwaysVisible: id === "elementalId",
      })),
    },
    cancelLabel: "Cancel",
    confirmLabel: "Confirm",
    title: "Preferences",
  };

  const { items, collectionProps, filterProps, paginationProps } =
    useCollection(isLoading ? [] : workflows, {
      filtering: {
        empty: (
          <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
            <b>No ingests</b>
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
          sortingColumn: columnDefinitions.find(
            (col) => col.id === "startDate",
          )!,
          isDescending: true,
        },
      },
      selection: {},
    });

  return (
    <>
      <Table
        {...collectionProps}
        variant="borderless"
        loadingText="Loading resources"
        loading={isLoading}
        trackBy="executionArn"
        header={
          <Header
            actions={
              <Button variant="primary" onClick={() => setModalVisible(true)}>
                New Ingest Job
              </Button>
            }
          >
            Ingest Jobs
          </Header>
        }
        columnDefinitions={columnDefinitions}
        columnDisplay={preferences.contentDisplay}
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
      <StartIngestModal
        modalVisible={modalVisible}
        setModalVisible={setModalVisible}
      />
    </>
  );
};

export default HlsIngestion;
