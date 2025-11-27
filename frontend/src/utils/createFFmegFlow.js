import { AWS_REGION, AWS_INGEST_CREATE_NEW_FLOW_ARN } from "@/constants";
import { SFNClient, StartSyncExecutionCommand } from "@aws-sdk/client-sfn";

const createFFmegFlow = async (flowId, changes, credentials) => {
  const sfnClient = new SFNClient({
    region: AWS_REGION,
    credentials,
  });
  const response = await sfnClient.send(
    new StartSyncExecutionCommand({
      stateMachineArn: AWS_INGEST_CREATE_NEW_FLOW_ARN,
      input: JSON.stringify({ flowId, changes }),
    })
  );
  return JSON.parse(response.output);
};

export default createFFmegFlow;
