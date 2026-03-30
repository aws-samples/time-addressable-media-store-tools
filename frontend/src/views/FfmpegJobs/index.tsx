import usePreferencesStore from "@/stores/usePreferencesStore";
import { AWS_REGION, STATUS_MAPPINGS, PAGE_SIZE_PREFERENCE } from "@/constants";
import {
  Box,
  CollectionPreferences,
  Link as ExternalLink,
  Header,
  Pagination,
  StatusIndicator,
  Table,
  TextFilter,
} from "@cloudscape-design/components";
import { Link } from "react-router-dom";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { useJobs } from "@/hooks/useFfmpeg";
import type { JobTarget } from "@/types/ingestFFmpeg";
import type { TableProps } from "@cloudscape-design/components";

type JobItem =
  | { key: string; id: string; parentId: null }
  | ({ key: string; parentId: string } & JobTarget);

const columnDefinitions: TableProps.ColumnDefinition<JobItem>[] = [
  {
    id: "id",
    header: "Origin Flow",
    cell: (item) => item.parentId === null && <Link to={`/flows/${item.id}`}>{item.id}</Link>,
    sortingField: "id",
    isRowHeader: true,
    width: 310,
  },
  {
    id: "sourceTimerange",
    header: "Timerange",
    cell: (item) => item.parentId && item.sourceTimerange,
    sortingField: "sourceTimerange",
    maxWidth: 160,
  },
  {
    id: "command",
    header: "FFmpeg Command",
    cell: (item) => item.parentId && item.ffmpeg && Object.entries(item.ffmpeg?.command).map((arg) => arg.join(" ")).join(" "),
    sortingField: "command",
    maxWidth: 200,
  },
  {
    id: "outputFlow",
    header: "Destination Flow",
    cell: (item) => item.parentId &&  <Link to={`/flows/${item.outputFlow}`}>{item.outputFlow}</Link>,
    sortingField: "outputFlow",
    width: 310,
  },
  {
    id: "status",
    header: "Status",
    cell: (item) =>
      item.parentId && item.status && (
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
    cell: (item) => item.parentId && item.startDate,
    sortingField: "startDate",
  },
  {
    id: "stopDate",
    header: "Stop",
    cell: (item) => item.parentId && item.stopDate,
    sortingField: "stopDate",
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

const FfmpegJobs = () => {
  const preferences = usePreferencesStore((state) => state.ffmpegJobsPreferences);
  const setPreferences = usePreferencesStore((state) => state.setFfmpegJobsPreferences);
  const { jobs, isLoading } = useJobs();
  const { items, collectionProps, filterProps, paginationProps } =
    useCollection(jobs ?? [], {
      expandableRows: {
        getId: (item) => item.key,
        getParentId: (item) => item.parentId,
      },
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
          sortingColumn: columnDefinitions.find((col) => col.id === "startDate")!,
          isDescending: true
        },
      },
      selection: {},
    });

  return (
    <Table
      {...collectionProps}
      variant="borderless"
      wrapLines
      loadingText="Loading resources"
      loading={isLoading}
      trackBy="key"
      header={<Header>Jobs</Header>}
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

export default FfmpegJobs;
