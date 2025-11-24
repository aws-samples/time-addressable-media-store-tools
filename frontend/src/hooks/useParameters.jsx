import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import useSWR from "swr";
import { AWS_REGION } from "@/constants";
import useAwsCredentials from "@/hooks/useAwsCredentials";

export const useParameter = (parameterName) => {
  const credentials = useAwsCredentials();
  const { data, error, isLoading } = useSWR(
    ["/ssm-parameters", parameterName],
    async ([, parameterName]) => {
      const client = new SSMClient({
        region: AWS_REGION,
        credentials,
      });
      const response = await client.send(
        new GetParameterCommand({ Name: parameterName })
      );
      return JSON.parse(response.Parameter.Value);
    }
  );

  return {
    parameter: data,
    isLoading,
    error,
  };
};
