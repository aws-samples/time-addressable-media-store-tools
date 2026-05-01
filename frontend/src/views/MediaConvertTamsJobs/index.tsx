import { useState } from "react";
import {
  PAGE_SIZE,
  STATUS_MAPPINGS,
  DATE_FORMAT,
  CONTAINER_FILE_EXTENSION,
} from "@/constants";
import {
  Box,
  Button,
  Header,
  Pagination,
  ProgressBar,
  StatusIndicator,
  Table,
  TextFilter,
} from "@cloudscape-design/components";
import { DateTime } from "luxon";
import JobDetailModal from "./components/JobDetailModal";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { useTamsJobs } from "@/hooks/useMediaConvert";
import useAwsCredentials from "@/hooks/useAwsCredentials";
import getS3PresignedUrl from "@/utils/getS3PresignedUrl";
import type { Job, OutputGroup } from "@aws-sdk/client-mediaconvert";
import type { TableProps } from "@cloudscape-design/components";

const MediaConvertTamsJobs = () => {
  const { jobs, isLoading } = useTamsJobs();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Job | undefined>(undefined);
  const credentials = useAwsCredentials();

  const handleDownload = async (outputGroup: OutputGroup) => {
    const destination =
      outputGroup.OutputGroupSettings?.FileGroupSettings?.Destination;
    if (!destination) return;
    const fileExtension =
      CONTAINER_FILE_EXTENSION[
        outputGroup.Outputs?.[0]?.ContainerSettings
          ?.Container as keyof typeof CONTAINER_FILE_EXTENSION
      ];
    const s3Uri_parts = destination.split("/");
    const bucket = s3Uri_parts[2];
    const key = `${s3Uri_parts.slice(3).join("/")}.${fileExtension}`;
    const fileName = `${s3Uri_parts[s3Uri_parts.length - 1]}.${fileExtension}`;
    const url = await getS3PresignedUrl({
      bucket,
      key,
      expiry: 300,
      credentials,
      ResponseContentDisposition: `attachment; filename="${fileName}"`,
    });
    window.open(url, "_blank");
  };

  const preferences = {
    pageSize: PAGE_SIZE,
    contentDisplay: [
      { id: "filename", visible: true },
      { id: "id", visible: true },
      { id: "submitTime", visible: true },
      { id: "startTime", visible: true },
      { id: "finishTime", visible: true },
      { id: "output", visible: true },
      { id: "status", visible: true },
    ],
  };
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
      sorting: {},
      selection: {},
    });

  const columnDefinitions: TableProps.ColumnDefinition<Job>[] = [
    {
      id: "filename",
      header: "Output Filename",
      cell: (item) =>
        item.Settings?.OutputGroups?.[0]?.OutputGroupSettings?.FileGroupSettings?.Destination?.split(
          "/",
        ).slice(-1) ?? "",
      sortingField: "filename",
      isRowHeader: true,
    },
    {
      id: "id",
      header: "Job Id",
      cell: (item) => item.Id,
      sortingField: "id",
      isRowHeader: true,
    },
    {
      id: "submitTime",
      header: "Submit Time",
      cell: (item) =>
        item.Timing &&
        item.Timing.SubmitTime &&
        DateTime.fromJSDate(item.Timing.SubmitTime).toLocaleString(DATE_FORMAT),
      sortingField: "submitTime",
    },
    {
      id: "startTime",
      header: "Start Time",
      cell: (item) =>
        item.Timing &&
        item.Timing.StartTime &&
        DateTime.fromJSDate(item.Timing.StartTime).toLocaleString(DATE_FORMAT),
      sortingField: "startTime",
    },
    {
      id: "finishTime",
      header: "Finish Time",
      cell: (item) =>
        item.Timing &&
        item.Timing.FinishTime &&
        DateTime.fromJSDate(item.Timing.FinishTime).toLocaleString(DATE_FORMAT),
      sortingField: "finishTime",
    },
    {
      id: "output",
      header: "Output",
      cell: (item) =>
        item.Status == "COMPLETE" &&
        item.Settings?.OutputGroups?.[0] && (
          <Button
            onClick={() => handleDownload(item.Settings!.OutputGroups![0])}
            iconName="download"
            variant="icon"
          />
        ),
      sortingField: "output",
      width: 80,
    },
    {
      id: "status",
      header: "Jobs Status",
      cell: (item) => (
        <>
          {item.JobPercentComplete ? (
            <ProgressBar value={item.JobPercentComplete} />
          ) : (
            <StatusIndicator {...STATUS_MAPPINGS[item.Status!]}>
              {item.Status}
            </StatusIndicator>
          )}
          <Button
            variant="icon"
            iconName="status-info"
            onClick={() => handleClick({ item })}
          />
        </>
      ),
      sortingField: "status",
    },
  ];

  const handleClick = ({ item }: { item: Job }) => {
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
        trackBy="Id"
        header={<Header>MediaConvert TAMS Jobs</Header>}
        columnDefinitions={columnDefinitions}
        columnDisplay={preferences.contentDisplay}
        contentDensity="compact"
        stickyColumns={{ first: 0, last: 2 }}
        items={items}
        pagination={<Pagination {...paginationProps} />}
        filter={<TextFilter {...filterProps} />}
      />
      <JobDetailModal
        modalVisible={modalVisible}
        setModalVisible={setModalVisible}
        selectedItem={selectedItem}
      />
    </>
  );
};

export default MediaConvertTamsJobs;
