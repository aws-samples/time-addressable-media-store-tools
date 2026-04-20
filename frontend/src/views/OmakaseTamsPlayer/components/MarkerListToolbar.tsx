import { useMemo } from "react";
import { OmakasePlayerTimelineControlsToolbar } from "@byomakase/omakase-react-components";
import type {
  OmakasePlayerApi,
  MarkerLane,
  Marker,
  MarkerListApi,
} from "@byomakase/omakase-player";
import { Mode } from "@cloudscape-design/global-styles";
import {
  SEGMENTATION_PERIOD_MARKER_STYLE,
  THEME,
  MARKER_LANE_TEXT_LABEL_STYLE,
} from "../constants";

type Props = {
  omakasePlayer: OmakasePlayerApi;
  sourceMarkerList: MarkerListApi;
  currentSource: MarkerLane;
  segmentationLanes: MarkerLane[];
  selectedMarker: Marker | undefined;
  mode: Mode;
  onSegmentationLanesChange: React.Dispatch<React.SetStateAction<MarkerLane[]>>;
  onSelectedMarkerChange: React.Dispatch<
    React.SetStateAction<Marker | undefined>
  >;
  onSourceChange: React.Dispatch<React.SetStateAction<MarkerLane | undefined>>;
};

const MarkerListToolbar = ({
  omakasePlayer,
  sourceMarkerList,
  currentSource,
  segmentationLanes,
  selectedMarker,
  mode,
  onSegmentationLanesChange,
  onSelectedMarkerChange,
  onSourceChange,
}: Props) => {
  const toolbarConstants = useMemo(
    () => ({
      PERIOD_MARKER_STYLE: {
        ...SEGMENTATION_PERIOD_MARKER_STYLE,
        color: THEME[mode].colors.segmentationMarker,
      },
      HIGHLIGHTED_PERIOD_MARKER_STYLE: {
        ...SEGMENTATION_PERIOD_MARKER_STYLE,
        color: THEME[mode].colors.segmentationMarkerHighlighted,
      },
      TIMELINE_LANE_STYLE: THEME[mode].timelineLaneStyle,
      MARKER_LANE_TEXT_LABEL_STYLE: MARKER_LANE_TEXT_LABEL_STYLE,
    }),
    [mode],
  );

  return (
    <OmakasePlayerTimelineControlsToolbar
      selectedMarker={selectedMarker}
      omakasePlayer={omakasePlayer}
      markerListApi={sourceMarkerList}
      setSegmentationLanes={onSegmentationLanesChange}
      setSelectedMarker={onSelectedMarkerChange}
      onMarkerClickCallback={onSelectedMarkerChange}
      segmentationLanes={segmentationLanes}
      source={currentSource}
      setSource={onSourceChange}
      enableHotKeys={true}
      constants={toolbarConstants}
    />
  );
};

export default MarkerListToolbar;
