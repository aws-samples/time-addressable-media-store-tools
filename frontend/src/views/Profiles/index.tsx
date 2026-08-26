import { PAGE_SIZE_PREFERENCE } from "@/constants";
import {
  Box,
  CollectionPreferences,
  CopyToClipboard,
  Header,
  Pagination,
  Table,
  TextFilter,
} from "@cloudscape-design/components";
import { useProfiles } from "@/hooks/useProfiles";
import { Link } from "react-router";
import { useCollection } from "@cloudscape-design/collection-hooks";
import usePreferencesStore from "@/stores/usePreferencesStore";
import type { Profile } from "@/types/tams";
import type { TableProps } from "@cloudscape-design/components";

const columnDefinitions: TableProps.ColumnDefinition<Profile>[] = [
  {
    id: "id",
    header: "Id",
    cell: (item) => (
      <>
        <Link to={`/profiles/${item.id}`}>{item.id}</Link>
        <CopyToClipboard
          copyButtonAriaLabel="Copy Id"
          copyErrorText="Id failed to copy"
          copySuccessText="Id copied"
          textToCopy={item.id}
          variant="icon"
        />
      </>
    ),
    sortingField: "id",
    isRowHeader: true,
    width: 360,
  },
  {
    id: "label",
    header: "Label",
    cell: (item) => item.label,
    sortingField: "label",
  },
  {
    id: "description",
    header: "Description",
    cell: (item) => item.description,
    sortingField: "description",
  },
  {
    id: "created_by",
    header: "Created by",
    cell: (item) => item.created_by,
    sortingField: "created_by",
  },
  {
    id: "created",
    header: "Created",
    cell: (item) => item.created,
    sortingField: "created",
  },
  {
    id: "format",
    header: "Format",
    cell: (item) => item.flow_metadata.format,
    sortingField: "format",
  },
  {
    id: "codec",
    header: "Codec",
    cell: (item) => item.flow_metadata.codec,
    sortingField: "codec",
  },
  {
    id: "container",
    header: "Container",
    cell: (item) => item.flow_metadata.container,
    sortingField: "container",
  },
  {
    id: "avg_bit_rate",
    header: "Avg bit rate",
    cell: (item) => item.flow_metadata.avg_bit_rate,
    sortingField: "avg_bit_rate",
  },
];
const collectionPreferencesProps = {
  pageSizePreference: PAGE_SIZE_PREFERENCE,
  contentDisplayPreference: {
    title: "Column preferences",
    description: "Customize the columns visibility and order.",
    options: columnDefinitions.map(({ id, header }) => ({
      id: id!,
      label: header as string,
      alwaysVisible: id === "id",
    })),
  },
  cancelLabel: "Cancel",
  confirmLabel: "Confirm",
  title: "Preferences",
};

const Profiles = () => {
  const preferences = usePreferencesStore((state) => state.profilesPreferences);
  const setPreferences = usePreferencesStore(
    (state) => state.setProfilesPreferences,
  );
  const { profiles, isLoading } = useProfiles();
  const { items, collectionProps, filterProps, paginationProps } =
    useCollection(profiles ?? [], {
      filtering: {
        empty: (
          <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
            <b>No profiles</b>
          </Box>
        ),
        noMatch: (
          <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
            <b>No matches</b>
          </Box>
        ),
      },
      pagination: { pageSize: preferences.pageSize },
      sorting: {
        defaultState: {
          sortingColumn: columnDefinitions.find(({ id }) => id === "created")!,
          isDescending: true,
        },
      },
      selection: {},
    });

  return (
    <>
      <Table
        header={
          <Header
          >
            Profiles
          </Header>
        }
        {...collectionProps}
        variant="borderless"
        loadingText="Loading resources"
        loading={isLoading}
        trackBy="id"
        columnDefinitions={columnDefinitions}
        columnDisplay={preferences.contentDisplay}
        contentDensity="compact"
        items={items}
        pagination={<Pagination {...paginationProps} />}
        filter={<TextFilter {...filterProps} />}
        preferences={
          <CollectionPreferences
            {...collectionPreferencesProps}
            preferences={preferences}
            onConfirm={({ detail }) => setPreferences(detail)}
          />
        }
      />
    </>
  );
};

export default Profiles;
