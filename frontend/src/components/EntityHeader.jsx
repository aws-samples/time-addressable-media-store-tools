import {
  Button,
  SpaceBetween,
  Popover,
  StatusIndicator,
} from "@cloudscape-design/components";
import { useNavigate } from "react-router-dom";

import { AWS_HLS_OBJECT_LAMBDA_ACCESS_POINT_ARN } from "@/constants";
import SourceActionsButton from "@/components/SourceActionsButton";
import FlowActionsButton from "@/components/FlowActionsButton";
import getPresignedUrl from "@/utils/getPresignedUrl";

const EntityHeader = ({ type, entity }) => {
  const entityType = `${type.toLowerCase()}s`;
  const navigate = useNavigate();

  const handleCopyClick = async () => {
    const url = await getPresignedUrl({
      bucket: AWS_HLS_OBJECT_LAMBDA_ACCESS_POINT_ARN,
      key: `${entityType}/${entity.id}/manifest.m3u8`,
      expiry: 3600,
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
      {AWS_HLS_OBJECT_LAMBDA_ACCESS_POINT_ARN && (
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
