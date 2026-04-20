import { OmakaseMarkerListComponent } from "@byomakase/omakase-react-components";
import type {
  OmakasePlayerApi,
  MarkerLane,
  MarkerListApi,
} from "@byomakase/omakase-player";
import type { Flow } from "@/types/tams";
import { MARKER_LIST_CONFIG } from "../constants";
import MarkerListHeaderTemplate from "./MarkerListHeaderTemplate";
import MarkerListRowTemplate from "./MarkerListRowTemplate";
import MarkerListEmptyTemplate from "./MarkerListEmptyTemplate";
import MarkerListHeader from "./MarkerListHeader";

type Props = {
  omakasePlayer: OmakasePlayerApi;
  currentSource: MarkerLane;
  segmentationLanes: MarkerLane[];
  sourceMarkerList: MarkerListApi | undefined;
  flows: Flow[];
  mediaStartTime: number;
  sourceId: string;
  onSourceChange: (lane: MarkerLane) => void;
  onMarkerListCreated: (markerList: MarkerListApi) => void;
  onSegmentationLanesChange: React.Dispatch<React.SetStateAction<MarkerLane[]>>;
};

const MarkerListAndExport = ({
  omakasePlayer,
  currentSource,
  segmentationLanes,
  sourceMarkerList,
  flows,
  mediaStartTime,
  sourceId,
  onSourceChange,
  onMarkerListCreated,
  onSegmentationLanesChange,
}: Props) => {
  return (
    <>
      <MarkerListHeader
        segmentationLanes={segmentationLanes}
        source={currentSource}
        sourceMarkerList={sourceMarkerList}
        onSegmentationClickCallback={onSourceChange}
        sourceId={sourceId}
        flows={flows}
        markerOffset={mediaStartTime}
        omakasePlayer={omakasePlayer}
        onSegmentationLanesChange={onSegmentationLanesChange}
      />

      <MarkerListHeaderTemplate />
      <MarkerListRowTemplate />
      <MarkerListEmptyTemplate />

      <OmakaseMarkerListComponent
        omakasePlayer={omakasePlayer}
        config={{
          ...MARKER_LIST_CONFIG,
          source: currentSource,
          mode: "CUTLIST",
          thumbnailVttFile: omakasePlayer.timeline?.thumbnailVttFile,
        }}
        onCreateMarkerListCallback={(markerList) =>
          onMarkerListCreated(markerList)
        }
      />
    </>
  );
};

export default MarkerListAndExport;
