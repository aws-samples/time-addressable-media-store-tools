import {
  MarkerLane,
  OmakasePlayer,
  PeriodMarker,
} from "@byomakase/omakase-player";
import React, { useEffect, useState } from "react";
// @ts-ignore
import OmakaseExportModal from "../../../../components/OmakaseExportModal";
import { PopUpIcon } from "../../icons/PopUpIcon";
import "./OmakaseSegmentationHeader.css";
import { Flow, FlowSegment } from "@byomakase/omakase-react-components";
import { createEditTimeranges } from "../../util/export-util";

type OmakaseSegmentationHeaderProps = {
  segmentationLanes: MarkerLane[];
  source: MarkerLane | undefined;
  onSegementationClickCallback: (markerLane: MarkerLane) => void;
  sourceId: string,
  flows: Flow[];
  flowSegments: Map<string, FlowSegment[]>;
  markerOffset: number;
  omakasePlayer: OmakasePlayer;
};

const OmakaseSegmentationHeader = ({
  segmentationLanes,
  source,
  onSegementationClickCallback,
  sourceId,
  flows,
  markerOffset,
  omakasePlayer,
}: OmakaseSegmentationHeaderProps) => {
  const [editTimeranges, setEditTimeranges] = useState();
  // @ts-ignore
  const [omakaseModalVisible, setOmakaseModalVisible] = useState(false);
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

  const handleExportModal = () => {
    setEditTimeranges(
      // @ts-ignore
      createEditTimeranges(source, markerOffset, omakasePlayer)
    );
    setOmakaseModalVisible(true);
  };

  if (exportDisabled) {
    return (
      <div className="segmentation-export-disabled">
        <PopUpIcon />
        EXPORT
      </div>
    );
  }

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

      {source &&
        flows.find((flow) => flow.format === "urn:x-nmos:format:video") && (
          <>
            <div className="segmentation-export" onClick={handleExportModal}>
              <PopUpIcon />
              EXPORT
            </div>
            <OmakaseExportModal
              sourceId={sourceId}
              editTimeranges={editTimeranges}
              flows={flows}
              onModalToggle={setOmakaseModalVisible}
              isModalOpen={omakaseModalVisible}
            />
          </>
        )}
    </div>
  );
};

export default OmakaseSegmentationHeader;
