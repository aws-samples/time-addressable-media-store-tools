import {
  Box,
  CollectionPreferences,
  SpaceBetween,
  Table,
} from "@cloudscape-design/components";
import useStore from "@/stores/useStore";

import { SEGMENT_COUNT, DATE_FORMAT } from "@/constants";
import { parseTimerangeDateTime } from "@/utils/timerange";
import { useLastN } from "@/hooks/useSegments";

const SegmentsTab = ({ flowId }) => {
  const preferences = useStore((state) => state.segmentsPreferences);
  const setPreferences = useStore((state) => state.setSegmentsPreferences);
  const { segments, isLoading: loadingSegments } = useLastN(flowId, SEGMENT_COUNT);

  const columnDefinitions = [
    {
      id: "id",
      header: "Object Id",
      cell: (item) => item.object_id,
      isRowHeader: true,
    },
    {
      id: "timerange",
      header: "Timerange",
      cell: (item) => item.timerange,
    },
    {
      id: "ts_offset",
      header: "TS Offset",
      cell: (item) => item.ts_offset,
    },
    {
      id: "last_duration",
      header: "Last Duration",
      cell: (item) => item.last_duration,
    },
    {
      id: "sample_offset",
      header: "Sample Offset",
      cell: (item) => item.sample_offset,
    },
    {
      id: "sample_count",
      header: "Sample Count",
      cell: (item) => item.sample_count,
    },
    {
      id: "key_frame_count",
      header: "Key Frame Count",
      cell: (item) => item.key_frame_count,
    },
    {
      id: "timerange_start",
      header: "Timerange Start",
      cell: (item) => item.datetimeTimerange.start?.toLocaleString(DATE_FORMAT),
    },
    {
      id: "timerange_end",
      header: "Timerange End",
      cell: (item) => item.datetimeTimerange.end?.toLocaleString(DATE_FORMAT),
    },
  ];
  const collectionPreferencesProps = {
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


  return (
    <SpaceBetween size="xs">
      <i>Showing last {SEGMENT_COUNT} segments</i>
      <Table
        trackBy="object_id"
        variant="borderless"
        columnDefinitions={columnDefinitions}
        columnDisplay={preferences.contentDisplay}
        contentDensity="compact"
        items={
          segments &&
          segments.map((segment) => ({
            ...segment,
            datetimeTimerange: parseTimerangeDateTime(segment.timerange),
          }))
        }
        sortingDisabled
        loading={loadingSegments}
        loadingText="Loading segments..."
        empty={
          <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
            <b>No segments</b>
          </Box>
        }
        preferences={
          <CollectionPreferences
            {...collectionPreferencesProps}
            preferences={preferences}
            onConfirm={({ detail }) => setPreferences(detail)}
          />
        }
      />
    </SpaceBetween>
  );
};

export default SegmentsTab;
