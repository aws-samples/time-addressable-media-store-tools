import {
  Box,
  Button,
  CopyToClipboard,
  Header,
  SpaceBetween,
  Spinner,
  Tabs,
} from "@cloudscape-design/components";
import { useNavigate, useParams } from "react-router-dom";

import { AWS_HLS_API_ENDPOINT } from "@/constants";
import CollectedBy from "@/components/CollectedBy";
import Collection from "@/components/Collection";
import EntityDetails from "@/components/EntityDetails";
import EssenceParameters from "./components/EssenceParameters";
import SegmentsTab from "./components/SegmentsTab";
import Tags from "@/components/Tags";
import { useFlow } from "@/hooks/useFlows";

const Flow = () => {
  const { flowId } = useParams();
  const { flow, isLoading: loadingFlow } = useFlow(flowId);
  const navigate = useNavigate();

  const followLink = (e) => {
    e.preventDefault();
    navigate(e.detail.href);
  };

  return !loadingFlow ? (
    flow ? (
      <SpaceBetween size="l">
        <Header variant="h2">
          <SpaceBetween size="xl" direction="horizontal">
            <span>Flow details</span>
            {AWS_HLS_API_ENDPOINT && (
              <span>
                <Button
                  href={`/hlsplayer/flows/${flowId}`}
                  variant="inline-link"
                  onFollow={followLink}
                >
                  View HLS
                </Button>
                <CopyToClipboard
                  copyButtonAriaLabel="Copy Manifest link"
                  copyErrorText="Link failed to copy"
                  copySuccessText="Link copied"
                  textToCopy={`${AWS_HLS_API_ENDPOINT}/flows/${flowId}/manifest.m3u8`}
                  variant="icon"
                />
              </span>
            )}
            <Button
              href={`/player/flows/${flowId}`}
              variant="inline-link"
              onFollow={followLink}
            >
              View Player
            </Button>
            <Button
              href={`/diagram/flows/${flowId}`}
              variant="inline-link"
              onFollow={followLink}
            >
              View Diagram
            </Button>
          </SpaceBetween>
        </Header>
        <EntityDetails entity={flow} />
        <Tabs
          tabs={[
            {
              label: "Essence Parameters",
              id: "essence",
              content: (
                <EssenceParameters
                  essenceParameters={flow?.essence_parameters}
                />
              ),
            },
            {
              label: "Tags",
              id: "tags",
              content: <Tags entityType="flows" entity={flow} />,
            },
            {
              label: "Flow collections",
              id: "flow_collection",
              content: (
                <Collection
                  entityType="flows"
                  collection={flow.flow_collection}
                />
              ),
            },
            {
              label: "Collected by",
              id: "collected_by",
              content: (
                <CollectedBy
                  entityType="flows"
                  collectedBy={flow.collected_by}
                />
              ),
            },
            {
              label: "Segments",
              id: "segments",
              content: <SegmentsTab flowId={flowId} />,
            },
          ]}
        />
      </SpaceBetween>
    ) : (
      `No flow found with the id ${flowId}`
    )
  ) : (
    <Box textAlign="center">
      <Spinner />
    </Box>
  );
};

export default Flow;
