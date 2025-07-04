import {
  MarkerApi,
  MarkerLane,
  OmakasePlayer,
  PeriodMarker,
} from "@byomakase/omakase-player";
import { TimeRangeUtil } from "./time-range-util";
import { Flow, VideoFlow } from "@byomakase/omakase-react-components";

export type OmakaseExportModalOperations =
  | "Segment Concatenation"
  | "Flow Creation";
export type OmakaseExportModalFormats = "TS" | "MP4";

export type ExportFormData = {
  operation: OmakaseExportModalOperations;
  format: OmakaseExportModalFormats;
  bucket: string;
  filename: string;
  path: string;
  label: string;
  flows: Record<string, boolean>;
};

function resolveMaxBitRateVideoFlow(flows: Flow[]) {
  return flows.reduce(
    (maxBitRateVideoFlow: VideoFlow | undefined, currentFlow: Flow) => {
      if (currentFlow.format !== "urn:x-nmos:format:video") {
        return maxBitRateVideoFlow;
      }

      currentFlow as VideoFlow;

      if (maxBitRateVideoFlow === undefined) {
        return currentFlow;
      }

      if (currentFlow.avg_bit_rate !== undefined) {
        if (
          maxBitRateVideoFlow.avg_bit_rate !== undefined &&
          currentFlow.avg_bit_rate <= maxBitRateVideoFlow.avg_bit_rate
        ) {
          return maxBitRateVideoFlow;
        }

        return currentFlow;
      }

      return maxBitRateVideoFlow;
    },
    undefined
  );
}

export const createEditTimeranges = (
  source: MarkerLane,
  markerOffset: number,
  omakasePlayer: OmakasePlayer
) => {
  const timeRanges = source
    .getMarkers()
    .map((marker: MarkerApi) => {
      if ("time" in marker.timeObservation) {
        return undefined;
      }
      marker as PeriodMarker;
      if (
        marker.timeObservation.start == undefined ||
        marker.timeObservation.end == undefined
      ) {
        return undefined;
      }

      // ensures marker start time lines up with start of the frame in milliseconds
      const startTime = omakasePlayer.video.calculateFrameToTime(
        omakasePlayer.video.calculateTimeToFrame(marker.timeObservation.start)
      );
      const endTime = omakasePlayer.video.calculateFrameToTime(
        omakasePlayer.video.calculateTimeToFrame(marker.timeObservation.end)
      );

      const startMoment = TimeRangeUtil.secondsToTimeMoment(
        startTime + markerOffset
      );
      const endMoment = TimeRangeUtil.secondsToTimeMoment(
        endTime + markerOffset
      );
      const timeRange = TimeRangeUtil.toTimeRange(
        startMoment,
        endMoment,
        true,
        false
      );

      return TimeRangeUtil.formatTimeRangeExpr(timeRange);
    })
    .filter((timeRange) => timeRange !== undefined);
  return timeRanges;
};
