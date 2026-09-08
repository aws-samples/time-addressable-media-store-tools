import { useState, useCallback, useSyncExternalStore } from "react";
import { Tabs, Button } from "@cloudscape-design/components";
import {
  MarkerList,
  TimedItemsTrackEventType,
} from "@byomakase/omakase-player";
import type {
  MarkerListApi,
  MarkerTrackLane,
  OmakasePlayerApi,
} from "@byomakase/omakase-player";
import OmakaseExportModal from "@/components/OmakaseExportModal";
import DeleteModal from "./DeleteModal";
import { Flow } from "@/types/tams";
import {
  createEditTimeranges,
  isSpanningMarker,
  laneTrack,
  markerEnd,
  markerStart,
  segmentationNameFor,
} from "../utils";

type Props = {
  segmentationLanes: MarkerTrackLane[];
  source: MarkerTrackLane | undefined;
  sourceMarkerList: MarkerListApi | undefined;
  onSegmentationClickCallback: (markerLane: MarkerTrackLane) => void;
  sourceId: string;
  flows: Flow[];
  markerOffset: number;
  omakasePlayer: OmakasePlayerApi;
  onSegmentationLanesChange?: (lanes: MarkerTrackLane[]) => void;
};

const MarkerListHeader = ({
  segmentationLanes,
  source,
  sourceMarkerList,
  onSegmentationClickCallback,
  sourceId,
  flows,
  markerOffset,
  omakasePlayer,
  onSegmentationLanesChange,
}: Props) => {
  const [editTimeranges, setEditTimeranges] = useState<string[] | undefined>();
  const [omakaseModalVisible, setOmakaseModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [laneToDelete, setLaneToDelete] = useState<string | null>(null);

  // 1.x replaces the per-lane onMarkerCreate$/Update$/Delete$ trio with one event stream on the
  // lane's marker track.
  const subscribeToMarkerChanges = useCallback(
    (onChange: () => void) => {
      const track = source ? laneTrack(source) : undefined;
      if (!track) return () => {};
      const sub = track.onEvent$.subscribe({
        next: (event) => {
          if (
            event.type ===
              TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_ADDED ||
            event.type ===
              TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATED ||
            event.type ===
              TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_DELETED
          ) {
            onChange();
          }
        },
      });
      return () => sub.unsubscribe();
    },
    [source],
  );

  const getHasValidMarker = useCallback(() => {
    const track = source ? laneTrack(source) : undefined;
    if (!track) return false;
    return track.timedItems.some(
      (marker) =>
        isSpanningMarker(marker) &&
        markerStart(marker) != null &&
        markerEnd(marker) != null,
    );
  }, [source]);

  const hasValidMarker = useSyncExternalStore(
    subscribeToMarkerChanges,
    getHasValidMarker,
  );

  const exportDisabled = !hasValidMarker;

  const handleExportModal = () => {
    if (sourceMarkerList) {
      // Export order must follow the CUTLIST list order, which drag-reorder mutates. Only the
      // concrete MarkerList exposes that order; MarkerListApi has no marker accessor.
      setEditTimeranges(
        createEditTimeranges(
          (sourceMarkerList as MarkerList).markers,
          markerOffset,
          omakasePlayer,
        ),
      );
      setOmakaseModalVisible(true);
    }
  };

  const handleDismissTab = (laneId: string) => {
    setLaneToDelete(laneId);
    setDeleteModalVisible(true);
  };

  const handleConfirmDelete = () => {
    if (!laneToDelete || !onSegmentationLanesChange) return;
    if (omakasePlayer.timeline) {
      omakasePlayer.timeline.removeTimelineLane(laneToDelete);
    }
    const newLanes = segmentationLanes.filter((l) => l.id !== laneToDelete);
    onSegmentationLanesChange(newLanes);
    if (source?.id === laneToDelete && newLanes.length > 0) {
      onSegmentationClickCallback(newLanes[0]);
    }
    setLaneToDelete(null);
  };

  const hasVideoFlow = flows.some(
    (flow) => flow.format === "urn:x-nmos:format:video",
  );

  if (!source || !hasVideoFlow) {
    return null;
  }

  const labelForLane = (lane: MarkerTrackLane) =>
    segmentationNameFor(segmentationLanes.indexOf(lane));

  const deleteModalLaneName = laneToDelete
    ? (() => {
        const lane = segmentationLanes.find((l) => l.id === laneToDelete);
        return lane ? labelForLane(lane) : "";
      })()
    : "";

  return (
    <>
      <Tabs
        disableContentPaddings
        activeTabId={source.id}
        onChange={({ detail }) => {
          const lane = segmentationLanes.find(
            (l) => l.id === detail.activeTabId,
          );
          if (lane) onSegmentationClickCallback(lane);
        }}
        tabs={segmentationLanes.map((lane) => {
          const label = labelForLane(lane);
          return {
            id: lane.id,
            label,
            dismissible: segmentationLanes.length > 1,
            dismissLabel: `Remove ${label}`,
            onDismiss: () => handleDismissTab(lane.id),
            content: null,
          };
        })}
        actions={
          <Button
            iconName="external"
            disabled={exportDisabled}
            onClick={handleExportModal}
          >
            Export
          </Button>
        }
      />

      <OmakaseExportModal
        sourceId={sourceId}
        editTimeranges={editTimeranges}
        flows={flows}
        onModalToggle={setOmakaseModalVisible}
        isModalOpen={omakaseModalVisible}
      />

      <DeleteModal
        modalVisible={deleteModalVisible}
        setModalVisible={setDeleteModalVisible}
        laneName={deleteModalLaneName}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
};

export default MarkerListHeader;
