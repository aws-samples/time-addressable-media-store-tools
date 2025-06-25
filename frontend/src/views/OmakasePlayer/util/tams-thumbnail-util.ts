import { Flow, FlowSegment } from "@byomakase/omakase-react-components";
import { ImageFlow } from "@byomakase/omakase-react-components";
import { TimeRangeUtil } from "./time-range-util";

export class TAMSThumbnailUtil {
  public static resolveLowestQualityImageFlow(flows: Flow[]) {
    const imageFlows = flows.filter(
      (flow) => flow.format === "urn:x-tam:format:image"
    ) as ImageFlow[];

    if (imageFlows.length === 0) {
      return undefined;
    }

    const lowestQualityImageFlow = imageFlows.reduce<ImageFlow | undefined>(
      (lowestQualityFlow: undefined | ImageFlow, currentFlow: ImageFlow) => {
        if (lowestQualityFlow === undefined) {
          return currentFlow;
        }

        const lowestQualityFlowTotalPixels =
          lowestQualityFlow.essence_parameters.frame_width *
          lowestQualityFlow.essence_parameters.frame_height;
        const currentFlowTotalPixels =
          currentFlow.essence_parameters.frame_height *
          currentFlow.essence_parameters.frame_width;

        if (currentFlowTotalPixels < lowestQualityFlowTotalPixels) {
          return currentFlow;
        }

        return lowestQualityFlow;
      },
      undefined
    );

    return lowestQualityImageFlow;
  }

  public static generateThumbnailVtt(
    segments: FlowSegment[],
    videoEnd: number,
    timeOffset: number
  ): string {
    let vttLines: string[] = ["WEBVTT", ""];

    segments.forEach((segment, index) => {
      const getUrls = segment.get_urls || [];

      if (getUrls.length === 0) return;

      const start = TimeRangeUtil.timeMomentToSeconds(
        TimeRangeUtil.parseTimeRange(segment.timerange).start!
      );
      let end;

      if (index === segments.length - 1) {
        end = videoEnd - 0.001;
      } else {
        end =
          TimeRangeUtil.timeMomentToSeconds(
            TimeRangeUtil.parseTimeRange(segments.at(index + 1)!.timerange)
              .start!
          ) - 0.001;
      }

      const startTime = this.toTimestamp(start - timeOffset);
      const endTime = this.toTimestamp(end - timeOffset);

      vttLines.push(`${startTime} --> ${endTime}`);
      vttLines.push(segment.get_urls!.at(-1)!.url!);
      vttLines.push("");
    });

    return vttLines.join("\n");
  }

  public static generateThumbnailVttBlob(
    segments: FlowSegment[],
    videoEnd: number,
    timeOffset: number
  ) {
    const vttFile = this.generateThumbnailVtt(segments, videoEnd, timeOffset);

    const blob = new Blob([vttFile], { type: "text/vtt" });
    const blobUrl = URL.createObjectURL(blob);

    return blobUrl;
  }

  private static toTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.round((seconds % 1) * 1000); // Extract milliseconds correctly

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
  }
}
