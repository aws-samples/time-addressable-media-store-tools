import { useState, useEffect, useMemo } from "react";
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
import { createEditTimeranges } from "../utils";

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
  const [laneToDelete, setLaneToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [markerChangeCounter, setMarkerChangeCounter] = useState(0);

  const exportDisabled = useMemo(() => {
    if (!source) return true;

    const validMarkers = source
      .getMarkers()
      .filter(
        (marker) =>
          marker instanceof PeriodMarker &&
          marker.timeObservation.start != null &&
          marker.timeObservation.end != null,
      );

    return validMarkers.length === 0;
    // markerChangeCounter is intentionally included to trigger re-computation when markers change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, markerChangeCounter]);

  useEffect(() => {
    if (!source) return;

    const subscriptionUpdate = source.onMarkerUpdate$.subscribe({
      next: () => setMarkerChangeCounter((c) => c + 1),
    });

    const subscriptionDelete = source.onMarkerDelete$.subscribe({
      next: () => setMarkerChangeCounter((c) => c + 1),
    });

    const subscriptionCreate = source.onMarkerCreate$.subscribe({
      next: () => setMarkerChangeCounter((c) => c + 1),
    });

    return () => {
      subscriptionUpdate.unsubscribe();
      subscriptionDelete.unsubscribe();
      subscriptionCreate.unsubscribe();
    };
  }, [source]);

  const handleExportModal = () => {
    if (sourceMarkerList) {
      setEditTimeranges(
        createEditTimeranges(sourceMarkerList, markerOffset, omakasePlayer),
      );
      setOmakaseModalVisible(true);
    }
  };

  const handleDismissTab = (laneId: string) => {
    const lane = segmentationLanes.find((l) => l.id === laneId);
    if (!lane) return;

    setLaneToDelete({
      id: laneId,
      name: lane.description || `${segmentationLanes.indexOf(lane) + 1}`,
    });
    setDeleteModalVisible(true);
  };

  const handleConfirmDelete = () => {
    if (!laneToDelete || !onSegmentationLanesChange) return;

    // Remove from timeline
    if (omakasePlayer.timeline) {
      omakasePlayer.timeline.removeTimelineLane(laneToDelete.id);
    }

    // Update lanes state
    const newLanes = segmentationLanes.filter((l) => l.id !== laneToDelete.id);
    onSegmentationLanesChange(newLanes);

    // If we deleted the current source, switch to first remaining lane
    if (source?.id === laneToDelete.id && newLanes.length > 0) {
      onSegmentationClickCallback(newLanes[0]);
    }

    setLaneToDelete(null);
  };

  const hasVideoFlow = flows.find(
    (flow) => flow.format === "urn:x-nmos:format:video",
  );

  if (!source || !hasVideoFlow) {
    return null;
  }

  return (
    <>
      <Tabs
        activeTabId={source.id}
        onChange={({ detail }) => {
          const lane = segmentationLanes.find(
            (l) => l.id === detail.activeTabId,
          );
          if (lane) onSegmentationClickCallback(lane);
        }}
        tabs={segmentationLanes.map((lane, i) => ({
          id: lane.id,
          label: lane.description || `${i + 1}`,
          dismissible: segmentationLanes.length > 1,
          dismissLabel: `Remove ${lane.description || `${i + 1}`}`,
          onDismiss: () => handleDismissTab(lane.id),
          content: null,
        }))}
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
        laneName={laneToDelete?.name || ""}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
};

export default MarkerListHeader;
