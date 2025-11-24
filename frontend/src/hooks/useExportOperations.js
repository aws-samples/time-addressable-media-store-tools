import { useState, useEffect } from "react";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import useAwsCredentials from "@/hooks/useAwsCredentials";
import {
  AWS_REGION,
  OMAKASE_EXPORT_EVENT_PARAMETER,
  HAS_OMAKASE_EXPORT_CAPABILITY,
} from "@/constants";
import useAlertsStore from "@/stores/useAlertsStore";

const STATIC_OPERATIONS = {
  MEDIACONVERT_EXPORT: { title: "MediaConvert Export", schema: null },
};

export const useExportOperations = () => {
  const [operationSchemas, setOperationSchemas] = useState({});
  const credentials = useAwsCredentials();
  const addAlertItem = useAlertsStore((state) => state.addAlertItem);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);

  const operations = Object.entries(STATIC_OPERATIONS)
    .map(([key, { title }]) => ({ value: key, label: title }))
    .concat(
      Object.entries(operationSchemas).map(([key, { title }]) => ({
        value: key,
        label: title,
      }))
    );

  useEffect(() => {
    // Only fetch if export capability is available
    if (!HAS_OMAKASE_EXPORT_CAPABILITY) {
      return;
    }
    const fetchOperationSchemas = async () => {
      try {
        const client = new SSMClient({
          region: AWS_REGION,
          credentials,
        });
        const response = await client.send(
          new GetParameterCommand({ Name: OMAKASE_EXPORT_EVENT_PARAMETER })
        );
        setOperationSchemas(JSON.parse(response.Parameter.Value));
      } catch (error) {
        const id = crypto.randomUUID();
        addAlertItem({
          id,
          type: "error",
          content: `Error parsing the SSM parameter: ${OMAKASE_EXPORT_EVENT_PARAMETER}. ${error}`,
          dismissible: true,
          dismissLabel: "Dismiss message",
          onDismiss: () => delAlertItem(id),
        });
      }
    };

    fetchOperationSchemas();
  }, [credentials, addAlertItem, delAlertItem]);

  const getOperationSchema = (operation) => {
    return STATIC_OPERATIONS[operation]?.schema || operationSchemas[operation];
  };

  return {
    operations,
    operationSchemas,
    staticOperations: STATIC_OPERATIONS,
    getOperationSchema,
  };
};
