import {
  Button,
  SpaceBetween,
  Popover,
  StatusIndicator,
} from "@cloudscape-design/components";
import { IS_HLS_DEPLOYED, AWS_HLS_FUNCTION_URL } from "@/constants";
import SourceActionsButton from "@/components/SourceActionsButton";
import FlowActionsButton from "@/components/FlowActionsButton";
import useAwsCredentials from "@/hooks/useAwsCredentials";
import { useFollowLink } from "@/hooks/useFollowLink";
import getLambdaPresignedUrl from "@/utils/getLambdaPresignedUrl";
import type { Flow, Source } from "@/types/tams";

type Props = {
  type: string,
  entity: Source | Flow,
}

const EntityHeader = ({ type, entity }: Props) => {
  const entityType = `${type.toLowerCase()}s`;
  const followLink = useFollowLink();
  const credentials = useAwsCredentials();

  const handleCopyClick = async () => {
    const url = await getLambdaPresignedUrl({
      functionUrl: AWS_HLS_FUNCTION_URL,
      path: `${entityType}/${entity.id}/manifest.m3u8`,
      credentials,
    });
    navigator.clipboard.writeText(url);
  };

  return (
    <SpaceBetween size="xl" direction="horizontal">
      <span>{type} details</span>
      {IS_HLS_DEPLOYED && (
        <span>
          <Button
            href={`/hlsplayer/${entityType}/${entity.id}`}
            variant="inline-link"
            onFollow={followLink}
          >
            View HLS
          </Button>
          <Popover
            dismissButton={false}
            position="top"
            size="small"
            triggerType="custom"
            content={
              <StatusIndicator type="success">Link copied</StatusIndicator>
            }
          >
            <Button
              iconName="copy"
              variant="icon"
              onClick={handleCopyClick}
              ariaLabel="Copy Manifest link"
            />
          </Popover>
        </span>
      )}
      <Button
        href={`/player/${entityType}/${entity.id}`}
        variant="inline-link"
        onFollow={followLink}
      >
        View Player
      </Button>
      <Button
        href={`/diagram/${entityType}/${entity.id}`}
        variant="inline-link"
        onFollow={followLink}
      >
        View Diagram
      </Button>
      {
        {
          sources: <SourceActionsButton selectedItems={[entity as Source]} />,
          flows: <FlowActionsButton selectedItems={[entity as Flow]} />,
        }[entityType]
      }
    </SpaceBetween>
  );
};

export default EntityHeader;
