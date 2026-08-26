import {
  Box,
  Header,
  SpaceBetween,
  Spinner,
  Tabs,
} from "@cloudscape-design/components";
import { useParams } from "react-router";

import EntityDetails from "@/components/EntityDetails";
import EssenceParameters from "@/components/EssenceParameters";
import Tags from "@/components/Tags";
import { useProfile } from "@/hooks/useProfiles";
import type { Uuid } from "@/types/tams";

const Profile = () => {
  const { profileId } = useParams<{ profileId: Uuid }>();
  const { profile, isLoading: loadingProfile } = useProfile(profileId!);

  if (!profileId) return null;

  return !loadingProfile ? (
    profile ? (
      <SpaceBetween size="l">
        <Header
          variant="h2"
        >
          Profile details
        </Header>
        <EntityDetails entityType="profiles" entity={profile} readOnly={true} />
        <Tabs
          tabs={[
            {
              label: "Flow Metadata",
              id: "flow_metadata",
              content: (
                <EntityDetails entityType="flow_metadata" entity={profile.flow_metadata} readOnly={true} />
              ),
            },
            {
              label: "Essence Parameters",
              id: "essence",
              content: (
                <EssenceParameters
                  essenceParameters={profile.flow_metadata?.essence_parameters}
                />
              ),
            },
            {
              label: "Tags",
              id: "tags",
              content: <Tags entityType="profiles" entity={profile} readOnly />,
            },
          ]}
        />
      </SpaceBetween>
    ) : (
      `No profile found with the id ${profileId}`
    )
  ) : (
    <Box textAlign="center">
      <Spinner />
    </Box>
  );
};

export default Profile;
