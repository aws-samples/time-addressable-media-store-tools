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
import FlowsTab from "./components/FlowsTab";
import Tags from "@/components/Tags";
import { useSource } from "@/hooks/useSources";

const Source = () => {
  const { sourceId } = useParams();
  const { source, isLoading: loadingSource } = useSource(sourceId);
  const navigate = useNavigate();

  const followLink = (e) => {
    e.preventDefault();
    navigate(e.detail.href);
  };

  return !loadingSource ? (
    source ? (
      <SpaceBetween size="l">
        <Header variant="h2">
          <SpaceBetween size="xl" direction="horizontal">
            <span>Source details</span>
            {AWS_HLS_API_ENDPOINT && (
              <span>
                <Button
                  href={`/hlsplayer/sources/${sourceId}`}
                  variant="inline-link"
                  onFollow={followLink}
                >
                  View HLS
                </Button>
                <CopyToClipboard
                  copyButtonAriaLabel="Copy Manifest link"
                  copyErrorText="Link failed to copy"
                  copySuccessText="Link copied"
                  textToCopy={`${AWS_HLS_API_ENDPOINT}/sources/${sourceId}/manifest.m3u8`}
                  variant="icon"
                />
              </span>
            )}
            <Button
              href={`/player/sources/${sourceId}`}
              variant="inline-link"
              onFollow={followLink}
            >
              View Player
            </Button>
            <Button
              href={`/diagram/sources/${sourceId}`}
              variant="inline-link"
              onFollow={followLink}
            >
              View Diagram
            </Button>
          </SpaceBetween>
        </Header>
        <EntityDetails entity={source} />
        <Tabs
          tabs={[
            {
              label: "Tags",
              id: "tags",
              content: (
                <Tags id={sourceId} entityType="sources" tags={source.tags} />
              ),
            },
            {
              label: "Source collections",
              id: "source_collection",
              content: (
                <Collection
                  entityType="sources"
                  collection={source.source_collection}
                />
              ),
            },
            {
              label: "Collected by",
              id: "collected_by",
              content: (
                <CollectedBy
                  entityType="sources"
                  collectedBy={source.collected_by}
                />
              ),
            },
            {
              label: "Flows",
              id: "flows",
              content: <FlowsTab sourceId={sourceId} />,
            },
          ]}
        />
      </SpaceBetween>
    ) : (
      `No source found with the id ${sourceId}`
    )
  ) : (
    <Box textAlign="center">
      <Spinner />
    </Box>
  );
};

export default Source;
