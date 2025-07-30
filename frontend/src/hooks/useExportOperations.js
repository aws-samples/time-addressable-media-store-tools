import { useState, useEffect } from "react";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { fetchAuthSession } from "aws-amplify/auth";
import { AWS_REGION, OMAKASE_EXPORT_EVENT_PARAMETER } from "@/constants";
import useAlertsStore from "@/stores/useAlertsStore";

const STATIC_OPERATIONS = {
  MEDIACONVERT_EXPORT: { title: "MediaConvert Export", schema: null },
};

export const useExportOperations = () => {
  const [operationSchemas, setOperationSchemas] = useState({});
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
    const fetchOperationSchemas = async () => {
      try {
        const session = await fetchAuthSession();
        const parameterValue = await new SSMClient({
          region: AWS_REGION,
          credentials: session.credentials,
        })
          .send(
            new GetParameterCommand({ Name: OMAKASE_EXPORT_EVENT_PARAMETER })
          )
          .then((response) => response.Parameter.Value);

        setOperationSchemas(JSON.parse(parameterValue));
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
  }, [addAlertItem, delAlertItem]);

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
