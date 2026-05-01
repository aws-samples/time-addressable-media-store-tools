import { useState } from "react";
import { AWS_REGION, PAGE_SIZE, STATUS_MAPPINGS } from "@/constants";
import {
  Badge,
  Box,
  ButtonGroup,
  Link as ExternalLink,
  Header,
  Pagination,
  Popover,
  ProgressBar,
  SpaceBetween,
  StatusIndicator,
  Table,
  TextContent,
  TextFilter,
} from "@cloudscape-design/components";
import HlsIngestModal from "@/components/HlsIngestModal";
import { useCollection } from "@cloudscape-design/collection-hooks";
import useJobs from "@/hooks/useJobs";
import type { JobIngestion } from "@/types/ingestHls";
import type { TableProps } from "@cloudscape-design/components";

const MediaConvertHlsIngestion = () => {
  const { jobs, isLoading } = useJobs();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<JobIngestion | undefined>(
    undefined,
  );

  const preferences = {
    pageSize: PAGE_SIZE,
    contentDisplay: [
      { id: "id", visible: true },
      { id: "input", visible: true },
      { id: "status", visible: true },
      { id: "button", visible: true },
    ],
  };
  const columnDefinitions: TableProps.ColumnDefinition<JobIngestion>[] = [
    {
      id: "id",
      header: "Job Id",
      cell: (item) => (
        <ExternalLink
          external
          href={`https://${AWS_REGION}.console.aws.amazon.com/mediaconvert/home?region=${AWS_REGION}#/jobs/summary/${item.id}/`}
        >
          {item.id}
        </ExternalLink>
      ),
      sortingField: "Id",
      isRowHeader: true,
    },
    {
      id: "input",
      header: "First Input File Name",
      cell: (item) =>
        item.manifestExists ? (
          <Popover
            dismissButton={false}
            position="top"
            size="small"
            triggerType="text"
            content={item.manifestUri}
          >
            <TextContent>{item.fileName}</TextContent>
          </Popover>
        ) : (
          <SpaceBetween direction="horizontal" size="xs">
            <TextContent>{item.fileName}</TextContent>
            <Badge color="severity-medium">Missing Manifest</Badge>
          </SpaceBetween>
        ),
      sortingField: "input",
    },
    {
      id: "status",
      header: "Jobs Status",
      cell: (item) =>
        item.jobPercentComplete ? (
          <ProgressBar value={item.jobPercentComplete} />
        ) : (
          <StatusIndicator {...STATUS_MAPPINGS[item.status]}>
            {item.status}
          </StatusIndicator>
        ),
      sortingField: "status",
    },
    {
      id: "button",
      header: "",
      cell: (item) => (
        <ButtonGroup
          onItemClick={() => handleClick({ item })}
          items={[
            {
              type: "icon-button",
              id: "ingest",
              iconName: "add-plus",
              text: `Ingest ${item.id}`,
              disabled: !item.manifestExists,
            },
          ]}
          variant="icon"
        />
      ),
    },
  ];
  const { items, collectionProps, filterProps, paginationProps } =
    useCollection(jobs ?? [], {
      filtering: {
        empty: (
          <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
            <b>No jobs</b>
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
          sortingColumn: columnDefinitions.find((col) => col.id === "id")!,
        },
      },
      selection: {},
    });

  const handleClick = ({ item }: { item: JobIngestion }) => {
    setSelectedItem(item);
    setModalVisible(true);
  };

  return (
    <>
      <Table
        {...collectionProps}
        variant="borderless"
        loadingText="Loading resources"
        loading={isLoading}
        trackBy="id"
        header={<Header>MediaConvert HLS Jobs</Header>}
        columnDefinitions={columnDefinitions}
        columnDisplay={preferences.contentDisplay}
        contentDensity="compact"
        stickyColumns={{ first: 0, last: 1 }}
        items={items}
        pagination={<Pagination {...paginationProps} />}
        filter={<TextFilter {...filterProps} />}
      />
      <HlsIngestModal
        modalVisible={modalVisible}
        setModalVisible={setModalVisible}
        idPrefix={`mediaconvert-${selectedItem?.id ?? ""}`}
        manifestUri={selectedItem?.manifestUri ?? ""}
        onDismiss={() => setSelectedItem(undefined)}
      />
    </>
  );
};

export default MediaConvertHlsIngestion;
