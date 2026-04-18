import { useState } from "react";
import { PAGE_SIZE_PREFERENCE } from "@/constants";
import {
  Badge,
  Box,
  Button,
  CollectionPreferences,
  Header,
  Pagination,
  SpaceBetween,
  StatusIndicator,
  Table,
  TextFilter,
} from "@cloudscape-design/components";
import { useWebhooks } from "@/hooks/useWebhooks";
import { Link } from "react-router-dom";
import { useCollection } from "@cloudscape-design/collection-hooks";
import usePreferencesStore from "@/stores/usePreferencesStore";
import WebhookRegisterUpdateModal from "@/components/WebhookRegisterUpdateModal";
import WebhookActionsButton from "@/components/WebhookActionsButton";
import { STATUS_MAPPINGS } from "@/constants";
import type { WebhookGet } from "@/types/tams";
import type { TableProps } from "@cloudscape-design/components";

const columnDefinitions: TableProps.ColumnDefinition<WebhookGet>[] = [
  {
    id: "id",
    header: "Id",
    cell: (item) => <Link to={`/webhooks/${item.id}`}>{item.id}</Link>,
    sortingField: "id",
    isRowHeader: true,
    width: 360,
  },
  {
    id: "url",
    header: "Url",
    cell: (item) => item.url,
    sortingField: "url",
  },
  {
    id: "api_key_name",
    header: "API Key Name",
    cell: (item) => item.api_key_name,
    sortingField: "api_key_name",
  },
  {
    id: "status",
    header: "Status",
    cell: (item) =>
      <StatusIndicator type={STATUS_MAPPINGS[item.status]}>
        {item.status}
      </StatusIndicator>
    ,
    sortingField: "status",
  },
  {
    id: "events",
    header: "Events",
    cell: (item) =>
      item.events ? (<SpaceBetween direction="vertical" size="xs">
        {item.events.map((val, index) => (
          <div key={index}>{val}</div>
        ))}
      </SpaceBetween>) : null,
    sortingField: "events",
  },
  {
    id: "flow_ids",
    header: "Flow ids",
    cell: (item) => (
      <SpaceBetween direction="vertical" size="xs">
        {item.flow_ids?.map((flow_id) => (
          <Link key={flow_id} to={`/flows/${flow_id}`}>{flow_id}</Link>
        ))}
      </SpaceBetween>
    ),
    sortingField: "flow_ids",
    width: 360,
  },
  {
    id: "source_ids",
    header: "Source ids",
    cell: (item) => (
      <SpaceBetween direction="vertical" size="xs">
        {item.source_ids?.map((source_id) => (
          <Link key={source_id} to={`/sources/${source_id}`}>{source_id}</Link>
        ))}
      </SpaceBetween>
    ),
    sortingField: "source_ids",
    width: 360,
  },
  {
    id: "flow_collected_by_ids",
    header: "Flow collected by ids",
    cell: (item) => (
      <SpaceBetween direction="vertical" size="xs">
        {item.flow_collected_by_ids?.map((flow_id) => (
          <Link key={flow_id} to={`/flows/${flow_id}`}>{flow_id}</Link>
        ))}
      </SpaceBetween>
    ),
    sortingField: "flow_collected_by_ids",
    width: 360,
  },
  {
    id: "source_collected_by_ids",
    header: "Source collected by ids",
    cell: (item) => (
      <SpaceBetween direction="vertical" size="xs">
        {item.source_collected_by_ids?.map((source_id) => (
          <Link key={source_id} to={`/sources/${source_id}`}>{source_id}</Link>
        ))}
      </SpaceBetween>
    ),
    sortingField: "source_collected_by_ids",
    width: 360,
  },
  {
    id: "accept_get_urls",
    header: "Accept get urls",
    cell: (item) =>
      item.accept_get_urls?.length === 0 ? (<Badge color="severity-neutral">Empty list</Badge>) :
        item.accept_get_urls?.length && (
          <SpaceBetween direction="vertical" size="xs">
            {item.accept_get_urls.map((val, index) => (
              <div key={index}>{val}</div>
            ))}
          </SpaceBetween>
        ),
    sortingField: "accept_get_urls",
  },
  {
    id: "accept_storage_ids",
    header: "Accept storage ids",
    cell: (item) =>
      item.accept_storage_ids?.length && (
        <SpaceBetween direction="vertical" size="xs">
          {item.accept_storage_ids.map((val, index) => (
            <div key={index}>{val}</div>
          ))}
        </SpaceBetween>
      ),
    sortingField: "accept_storage_ids",
    width: 360,
  },
  {
    id: "presigned",
    header: "Presigned",
    cell: (item) => item.presigned !== undefined && <StatusIndicator type={item.presigned ? "success" : "error"} />,
    sortingField: "presigned",
  },
  {
    id: "verbose_storage",
    header: "Verbose storage",
    cell: (item) => item.verbose_storage !== undefined && <StatusIndicator type={item.verbose_storage ? "success" : "error"} />,
    sortingField: "verbose_storage",
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

const Webhooks = () => {
  const preferences = usePreferencesStore((state) => state.webhooksPreferences);
  const setPreferences = usePreferencesStore(
    (state) => state.setWebhooksPreferences,
  );
  const { webhooks, isLoading } = useWebhooks();
  const [modalVisible, setModalVisible] = useState(false);
  const [actionId, setActionId] = useState("");
  const { items, collectionProps, filterProps, paginationProps } =
    useCollection(webhooks ?? [], {
      filtering: {
        empty: (
          <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
            <b>No webhooks</b>
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
          sortingColumn: columnDefinitions.find(({ id }) => id === "url")!,
          isDescending: true,
        },
      },
      selection: {},
    });
  const { selectedItems } = collectionProps;

  const handleOnClick = ({ detail }: { detail: { id: string } }) => {
    setActionId(detail.id);
    setModalVisible(true);
  };

  return (
    <>
      <Table
        header={
          <Header
            actions={
              <SpaceBetween
                size="xs"
                direction="horizontal"
                alignItems="center"
              >
                <Button
                  onClick={() =>
                    handleOnClick({ detail: { id: "register" } })
                  }
                  disabled={selectedItems?.length !== 0}
                >
                  Register
                </Button>
                <WebhookActionsButton selectedItems={selectedItems ?? []} />
              </SpaceBetween>
            }
          >
            Webhooks
          </Header>
        }
        {...collectionProps}
        variant="borderless"
        loadingText="Loading resources"
        loading={isLoading}
        trackBy="id"
        selectionType="multi"
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
      {
        {
          register: (
            <WebhookRegisterUpdateModal
              modalVisible={modalVisible}
              setModalVisible={setModalVisible}
            />
          ),
        }[actionId]
      }

    </>
  );
};

export default Webhooks;
