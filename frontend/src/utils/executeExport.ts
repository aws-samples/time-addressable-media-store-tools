import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { AWS_REGION, OMAKASE_EXPORT_EVENT_BUS } from "@/constants";
import type { Uuid, Timerange } from "@/types/tams";
import type { CognitoIdentityCredentialProvider } from "@aws-sdk/credential-providers";

export const executeExport = async (
  formData: Record<string, any>,
  editTimeranges: Timerange[],
  flows: Uuid[],
  sourceId: Uuid,
  credentials: CognitoIdentityCredentialProvider,
): Promise<"success" | "error"> => {
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
};
