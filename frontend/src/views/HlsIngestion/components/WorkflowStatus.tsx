import { AWS_REGION, STATUS_MAPPINGS } from "@/constants";
import {
  Box,
  Link as ExternalLink,
  Popover,
  SpaceBetween,
  StatusIndicator,
} from "@cloudscape-design/components";
import type { Workflow } from "@/types/ingestHls";

const WorkflowStatus = ({ item }: { item: Workflow }) => {
  const hasWarnings = (item.warnings?.length ?? 0) > 0;
  const statusIndicator = (
    <StatusIndicator
      type={hasWarnings ? "warning" : STATUS_MAPPINGS[item.status]}
    >
      {item.status}
    </StatusIndicator>
  );
  return (
    <>
      {item.error || hasWarnings ? (
        <Popover
          dismissButton={false}
          size="large"
          content={
            item.error ? (
              <Box color="text-status-error">{item.error}</Box>
            ) : (
              <SpaceBetween size="xs">
                {item.warnings?.map((w, i) => (
                  <Box key={i}>
                    <Box color="text-body-secondary">{w.manifestUrl}</Box>
                    <Box color="text-status-warning" fontSize="body-s">
                      {w.message}
                    </Box>
                  </Box>
                ))}
              </SpaceBetween>
            )
          }
        >
          {statusIndicator}
        </Popover>
      ) : (
        statusIndicator
      )}
      <ExternalLink
        external
        href={`https://${AWS_REGION}.console.aws.amazon.com/states/home?region=${AWS_REGION}#/v2/executions/details/${item.executionArn}`}
        variant="info"
      />
    </>
  );
};

export default WorkflowStatus;
