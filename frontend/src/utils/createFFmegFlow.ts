import { AWS_REGION, AWS_INGEST_CREATE_NEW_FLOW_ARN } from "@/constants";
import { SFNClient, StartSyncExecutionCommand } from "@aws-sdk/client-sfn";
import type { Uuid } from "@/types/tams";
import type { CognitoIdentityCredentialProvider } from "@aws-sdk/credential-providers";

const createFFmegFlow = async (
  flowId: Uuid,
  changes: Record<string, unknown>,
  credentials: CognitoIdentityCredentialProvider,
): Promise<string> => {
  const sfnClient = new SFNClient({
    region: AWS_REGION,
    credentials,
  });
  const response = await sfnClient.send(
    new StartSyncExecutionCommand({
      stateMachineArn: AWS_INGEST_CREATE_NEW_FLOW_ARN,
      input: JSON.stringify({ flowId, changes }),
    }),
  );
  if (!response.output) {
    throw new Error("No output from Step Function start execution");
  }
  return JSON.parse(response.output);
};

export default createFFmegFlow;
