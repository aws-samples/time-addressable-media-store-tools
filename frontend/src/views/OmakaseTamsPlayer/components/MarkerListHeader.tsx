import { useState, useCallback, useSyncExternalStore } from "react";
import { Tabs, Button } from "@cloudscape-design/components";
import {
  MarkerLane,
  MarkerListApi,
  OmakasePlayerApi,
  PeriodMarker,
} from "@byomakase/omakase-player";
import OmakaseExportModal from "@/components/OmakaseExportModal";
import DeleteModal from "./DeleteModal";
import { Flow } from "@/types/tams";
import { createEditTimeranges, segmentationNameFor } from "../utils";

type Props = {
  segmentationLanes: MarkerLane[];
  source: MarkerLane | undefined;
  sourceMarkerList: MarkerListApi | undefined;
  onSegmentationClickCallback: (markerLane: MarkerLane) => void;
  sourceId: string;
  flows: Flow[];
  markerOffset: number;
  omakasePlayer: OmakasePlayerApi;
  onSegmentationLanesChange?: (lanes: MarkerLane[]) => void;
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

  const subscribeToMarkerChanges = useCallback(
    (onChange: () => void) => {
      if (!source) return () => { };
      const subs = [
        source.onMarkerCreate$.subscribe({ next: onChange }),
        source.onMarkerUpdate$.subscribe({ next: onChange }),
        source.onMarkerDelete$.subscribe({ next: onChange }),
      ];
      return () => subs.forEach((s) => s.unsubscribe());
    },
    [source],
  );

  const getHasValidMarker = useCallback(() => {
    if (!source) return false;
    return source
      .getMarkers()
      .some(
        (m) =>
          m instanceof PeriodMarker &&
          m.timeObservation.start != null &&
          m.timeObservation.end != null,
      );
  }, [source]);

  const hasValidMarker = useSyncExternalStore(
    subscribeToMarkerChanges,
    getHasValidMarker,
  );

  const exportDisabled = !hasValidMarker;

  const handleExportModal = () => {
    if (sourceMarkerList) {
      setEditTimeranges(
        createEditTimeranges(sourceMarkerList, markerOffset, omakasePlayer),
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

  const labelForLane = (lane: MarkerLane) =>
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
