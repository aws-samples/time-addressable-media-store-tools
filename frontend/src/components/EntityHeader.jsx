import {
  Button,
  SpaceBetween,
  Popover,
  StatusIndicator,
} from "@cloudscape-design/components";
import { useNavigate } from "react-router-dom";

import { IS_HLS_DEPLOYED, AWS_HLS_FUNCTION_URL } from "@/constants";
import SourceActionsButton from "@/components/SourceActionsButton";
import FlowActionsButton from "@/components/FlowActionsButton";
import useAwsCredentials from "@/hooks/useAwsCredentials";
import getLambdaPresignedUrl from "@/utils/getLambdaPresignedUrl";

const EntityHeader = ({ type, entity }) => {
  const entityType = `${type.toLowerCase()}s`;
  const navigate = useNavigate();
  const credentials = useAwsCredentials();

  const handleCopyClick = async () => {
    const url = await getLambdaPresignedUrl({
      functionUrl: AWS_HLS_FUNCTION_URL,
      path: `${entityType}/${entity.id}/manifest.m3u8`,
      credentials,
    });
    navigator.clipboard.writeText(url);
  };

  const followLink = (e) => {
    e.preventDefault();
    navigate(e.detail.href);
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
          sources: <SourceActionsButton selectedItems={[entity]} />,
          flows: <FlowActionsButton selectedItems={[entity]} />,
        }[entityType]
      }
    </SpaceBetween>
  );
};

export default EntityHeader;
