import { fetchAuthSession } from "aws-amplify/auth";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";

export async function executeExport(formData, editTimeranges, flows) {
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
  let configuration = {};

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

  const editFlows = Object.keys(formData.flows).filter(
    (key) => formData.flows[key]
  );

  const firstVideoFlow = flows?.filter((flow) => {
    return flow.format === "urn:x-nmos:format:video";
  })[0];

  if (firstVideoFlow) {
    editFlows.push(firstVideoFlow.id);
  }

  const editPayload = editTimeranges.map((timeRange) => ({
    timerange: timeRange,
    flows: editFlows,
  }));
  const params = {
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

export function createInitialFormData(flows) {
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
      }, {}),
  };
}
