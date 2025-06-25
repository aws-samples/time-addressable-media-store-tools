import { fetchAuthSession } from "aws-amplify/auth";
import {
  EventBridgeClient,
  PutEventsCommand,
  PutEventsCommandInput,
} from "@aws-sdk/client-eventbridge";
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

export async function executeExport(
  formData: ExportFormData,
  flows: Flow[],
  source: MarkerLane,
  markerOffset: number,
  omakasePlayer: OmakasePlayer
): Promise<void> {
  const { credentials } = await fetchAuthSession();

  const region =
    //@ts-ignore
    import.meta.env.VITE_APP_AWS_REGION;

  if (region === undefined) {
    console.error("VITE_EXPORT_EVENT_BRIDGE_REGION is not defined in .env");
  }

  const client = new EventBridgeClient({
    region: region,
    credentials: credentials,
  });

  const selectedFlows = Object.keys(formData.flows).filter(
    (key) => formData.flows[key]
  );
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

  const editFlows = selectedFlows;
  const videoFlow = resolveMaxBitRateVideoFlow(flows);
  if (videoFlow) {
    editFlows.push(videoFlow.id);
  }

  const editPayload = timeRanges.map((timeRange) => ({
    timerange: timeRange,
    flows: editFlows,
  }));

  let configuration: any = {};

  if (formData.operation === "Segment Concatenation") {
    configuration.format = formData.format;
    configuration.output = {
      bucket: formData.bucket !== "" ? formData.bucket : undefined,
      path: formData.path !== "" ? formData.path : undefined,
      filename: formData.filename !== "" ? formData.filename : undefined,
    };
  } else if (formData.operation === "Flow Creation") {
    configuration.label = formData.label;
  }

  const operation = formData.operation.replaceAll(" ", "_").toUpperCase();

  const eventBusName =
    //@ts-ignore
    import.meta.env.VITE_APP_OMAKASE_EXPORT_EVENT_BUS ?? "omakase-tams";

  const params: PutEventsCommandInput = {
    Entries: [
      {
        Source: "TAMS_UX",
        DetailType: "TAMS_PROCESSING_REQUEST",
        Detail: JSON.stringify({
          edit: editPayload,
          operation: operation,
          configuration: configuration,
        }),
        EventBusName: eventBusName,
      },
    ],
  };

  await client.send(new PutEventsCommand(params));
}

export function createInitialFormData(flows: Flow[]): ExportFormData {
  return {
    operation: "Segment Concatenation",
    format: "TS",
    bucket: "",
    path: "",
    filename: "",
    label: "",
    flows: flows
      .filter((flow) => flow.format === "urn:x-nmos:format:audio")
      .reduce((acc, flow) => {
        acc[flow.id] = true;
        return acc;
      }, {} as Record<string, boolean>),
  };
}