import { useState } from "react";
import { AWS_REGION, PAGE_SIZE, STATUS_MAPPINGS } from "@/constants";
import {
  Box,
  Button,
  Link as ExternalLink,
  Header,
  Pagination,
  StatusIndicator,
  Table,
  TextFilter,
} from "@cloudscape-design/components";
import StartIngestModal from "@/components/StartIngestModal";

import { useCollection } from "@cloudscape-design/collection-hooks";
import { useWorkflows } from "@/hooks/useStateMachine";

const HlsIngestion = () => {
  const { workflows, isLoading } = useWorkflows();
  const [modalVisible, setModalVisible] = useState(false);

  const preferences = {
    pageSize: PAGE_SIZE,
    contentDisplay: [
      { id: "elementalService", visible: true },
      { id: "elementalId", visible: true },
      { id: "status", visible: true },
      { id: "startDate", visible: true },
      { id: "stopDate", visible: true },
    ],
  };
  const { items, collectionProps, filterProps, paginationProps } =
    useCollection(isLoading ? [] : workflows, {
      filtering: {
        empty: (
          <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
            <b>No ingestions</b>
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
  const columnDefinitions = [
    {
      id: "elementalService",
      header: "Source",
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
      cell: (item) => (
        <>
          <StatusIndicator type={STATUS_MAPPINGS[item.status]}>
            {item.status}
          </StatusIndicator>
          <ExternalLink
            external
            href={`https://${AWS_REGION}.console.aws.amazon.com/states/home?region=${AWS_REGION}#/v2/executions/details/${item.executionArn}`}
            variant="info"
          />
        </>
      ),
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
  ];

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
                New Ingestion
              </Button>
            }
          >
            Ingestions
          </Header>
        }
        columnDefinitions={columnDefinitions}
        columnDisplay={preferences.contentDisplay}
        items={items}
        pagination={<Pagination {...paginationProps} />}
        filter={<TextFilter {...filterProps} />}
      />
      <StartIngestModal
        modalVisible={modalVisible}
        setModalVisible={setModalVisible}
        source="hls"
        recordId={crypto.randomUUID()}
        initialManifest=""
        setSelectedItem={() => true}
        readOnlyManifest={false}
      />
    </>
  );
};

export default HlsIngestion;
