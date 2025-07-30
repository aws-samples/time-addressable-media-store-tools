import { fetchAuthSession } from "aws-amplify/auth";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { AWS_REGION, OMAKASE_EXPORT_EVENT_BUS } from "@/constants";

const getMaxBitRateVideoFlow = (flows) => {
  const videoFlows = flows?.filter(
    (flow) => flow.format === "urn:x-nmos:format:video"
  );

  if (!videoFlows?.length) return null;

  if (videoFlows.some((flow) => flow.avg_bit_rate)) {
    return videoFlows.reduce((max, flow) =>
      !max.avg_bit_rate ||
      (flow.avg_bit_rate && flow.avg_bit_rate > max.avg_bit_rate)
        ? flow
        : max
    );
  }

  if (videoFlows.some((flow) => flow.max_bit_rate)) {
    return videoFlows.reduce((max, flow) =>
      !max.max_bit_rate ||
      (flow.max_bit_rate && flow.max_bit_rate > max.max_bit_rate)
        ? flow
        : max
    );
  }

  return videoFlows[0];
};

export const executeExport = async (formData, editTimeranges, flows, sourceId) => {
  const { credentials } = await fetchAuthSession();
  const client = new EventBridgeClient({
    region: AWS_REGION,
    credentials: credentials,
  });

  const { operation, ...configuration } = formData;
  const editPayload = editTimeranges.map((timerange) => ({
    timerange,
    flows,
  }));
  const params = {
    Entries: [
      {
        Source: "TAMS_UX",
        DetailType: "TAMS_PROCESSING_REQUEST",
        Detail: JSON.stringify({
          sourceId,
          edit: editPayload,
          operation: operation,
          configuration: configuration,
        }),
        EventBusName: OMAKASE_EXPORT_EVENT_BUS,
      },
    ],
  };
  try {
    await client.send(new PutEventsCommand(params));
    return "success";
  } catch (error) {
    console.log(error);
    return "error";
  }
}
