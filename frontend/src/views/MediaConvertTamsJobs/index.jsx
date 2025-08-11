import { useState } from "react";
import { PAGE_SIZE, STATUS_MAPPINGS, DATE_FORMAT } from "@/constants";
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

const MediaConvertTamsJobs = () => {
  const { jobs, isLoading } = useTamsJobs();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState({});

  const preferences = {
    pageSize: PAGE_SIZE,
    contentDisplay: [
      { id: "id", visible: true },
      { id: "submitTime", visible: true },
      { id: "startTime", visible: true },
      { id: "finishTime", visible: true },
      { id: "status", visible: true },
    ],
  };
  const { items, collectionProps, filterProps, paginationProps } =
    useCollection(isLoading ? [] : jobs, {
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
  const columnDefinitions = [
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
        item.Timing.SubmitTime &&
        DateTime.fromJSDate(item.Timing.SubmitTime).toLocaleString(DATE_FORMAT),
      sortingField: "submitTime",
    },
    {
      id: "startTime",
      header: "Start Time",
      cell: (item) =>
        item.Timing.StartTime &&
        DateTime.fromJSDate(item.Timing.StartTime).toLocaleString(DATE_FORMAT),
      sortingField: "startTime",
    },
    {
      id: "finishTime",
      header: "Finish Time",
      cell: (item) =>
        item.Timing.FinishTime &&
        DateTime.fromJSDate(item.Timing.FinishTime).toLocaleString(DATE_FORMAT),
      sortingField: "finishTime",
    },
    {
      id: "status",
      header: "Jobs Status",
      cell: (item) => (
        <>
          {item.jobPercentComplete ? (
            <ProgressBar value={item.jobPercentComplete} />
          ) : (
            <StatusIndicator type={STATUS_MAPPINGS[item.Status]}>
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

  const handleClick = ({ item }) => {
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
        stickyColumns={{ first: 0, last: 1 }}
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
