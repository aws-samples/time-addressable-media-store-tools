import { MarkerLane, PeriodMarker } from "@byomakase/omakase-player";
import React, { useEffect, useState } from "react";
import OmakaseExportModal from "../OmakaseModal/OmakaseExportModal";
import { Flow, FlowSegment } from "../../types/tams";

type OmakaseSegmentationHeaderProps = {
  segmentationLanes: MarkerLane[];
  source: MarkerLane | undefined;
  onSegementationClickCallback: (markerLane: MarkerLane) => void;
  flows: Flow[];
  flowSegments: Map<string, FlowSegment[]>;
  markerOffset: number;
};

const OmakaseSegmentationHeader = ({
  segmentationLanes,
  source,
  onSegementationClickCallback,
  flows,
  flowSegments,
  markerOffset,
}: OmakaseSegmentationHeaderProps) => {
  const segmentationNamesClassName =
    segmentationLanes.length < 3
      ? "segmentation-names"
      : "segmentation-names segmentation-names-smaller";

  let segmentationHeaderClassName =
    segmentationLanes.length > 1
      ? "segmentation-header"
      : "segmentation-header segmentation-header-export-only";

  const checkExportDisabled = () => {
    if (
      source &&
      source
        .getMarkers()
        .filter(
          (marker) =>
            marker instanceof PeriodMarker &&
            marker.timeObservation.start != null &&
            marker.timeObservation.end != null
        ).length === 0
    ) {
      return true;
    }
    return false;
  };

  const [exportDisabled, setExportDisabled] = useState(checkExportDisabled());

  useEffect(() => {
    if (source === undefined) {
      return;
    }

    setExportDisabled(() => checkExportDisabled());

    const subscriptionUpdate = source.onMarkerUpdate$.subscribe({
      next: () => {
        setExportDisabled(() => checkExportDisabled());
      },
    });

    const subscriptionDelete = source.onMarkerDelete$.subscribe({
      next: () => {
        setExportDisabled(() => checkExportDisabled());
      },
    });

    const subscriptionCreate = source.onMarkerCreate$.subscribe({
      next: () => {
        setExportDisabled(() => checkExportDisabled());
      },
    });

    return () =>
      [subscriptionUpdate, subscriptionDelete, subscriptionCreate].forEach(
        (sub) => sub.unsubscribe()
      );
  }, [source]);

  return (
    <div className={segmentationHeaderClassName}>
      {segmentationLanes.length > 1 && (
        <div className={segmentationNamesClassName}>
          {segmentationLanes.map((lane) => (
            <div
              className={
                source?.id === lane.id ? "highlighted-segmentation" : ""
              }
              key={lane.id}
              onClick={() => onSegementationClickCallback(lane)}
            >
              {lane.name}
            </div>
          ))}
        </div>
      )}

      {source && (
        <OmakaseExportModal
          flows={flows}
          source={source}
          markerOffset={markerOffset}
          exportDisabled={exportDisabled}
        />
      )}
    </div>
  );
};

export default OmakaseSegmentationHeader;
