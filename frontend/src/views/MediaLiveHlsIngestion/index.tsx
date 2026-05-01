import { useState } from "react";
import { AWS_REGION, PAGE_SIZE, STATUS_MAPPINGS } from "@/constants";
import {
  Box,
  ButtonGroup,
  Link as ExternalLink,
  Header,
  Pagination,
  Popover,
  StatusIndicator,
  Table,
  TextContent,
  TextFilter,
} from "@cloudscape-design/components";
import HlsIngestModal from "@/components/HlsIngestModal";
import ConfirmationModal from "./components/ConfirmationModal";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { useChannels } from "@/hooks/useChannels";
import type { ChannelIngestion } from "@/types/ingestHls";
import type { ButtonGroupProps } from "@cloudscape-design/components";
import type { TableProps } from "@cloudscape-design/components";

const MediaLiveHlsIngestion = () => {
  const { channels, isLoading } = useChannels();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<
    ChannelIngestion | undefined
  >(undefined);
  const [actionId, setActionId] = useState("");

  const preferences = {
    pageSize: PAGE_SIZE,
    contentDisplay: [
      { id: "id", visible: true },
      { id: "name", visible: true },
      { id: "manifest", visible: true },
      { id: "state", visible: true },
      { id: "button", visible: true },
    ],
  };
  const columnDefinitions: TableProps.ColumnDefinition<ChannelIngestion>[] = [
    {
      id: "id",
      header: "Channel Id",
      cell: (item) => (
        <ExternalLink
          external
          href={`https://${AWS_REGION}.console.aws.amazon.com/medialive/home?region=${AWS_REGION}#/channels/${item.id}/`}
        >
          {item.id}
        </ExternalLink>
      ),
      sortingField: "id",
      isRowHeader: true,
    },
    {
      id: "name",
      header: "Channel Name",
      cell: (item) => item.name,
      sortingField: "name",
    },
    {
      id: "manifest",
      header: "Manifest Uri",
      cell: (item) => (
        <Popover
          dismissButton={false}
          position="top"
          size="small"
          triggerType="text"
          content={item.manifestUri}
        >
          <TextContent>{item.manifestUri?.replace(/^.*[\\/]/, "")}</TextContent>
        </Popover>
      ),
      sortingField: "manifest",
    },
    {
      id: "state",
      header: "Channel State",
      cell: (item) => (
        <StatusIndicator {...STATUS_MAPPINGS[item.state]}>
          {item.state}
        </StatusIndicator>
      ),
      sortingField: "state",
    },
    {
      id: "button",
      header: "",
      cell: (item) => (
        <ButtonGroup
          onItemClick={({ detail }) => handleClick({ detail, item })}
          items={[
            {
              type: "icon-button",
              id: "ingest",
              iconName: "add-plus",
              disabled: item.ingesting,
              disabledReason: "Ingestion already in progess",
              text: "Ingest HLS",
            },
            {
              type: "icon-button",
              id: "start",
              iconName: "play",
              disabled: !item.manifestUri || item.state !== "IDLE",
              text: "Start Channel",
            },
            {
              type: "icon-button",
              id: "stop",
              iconName: "pause",
              disabled: !item.manifestUri || item.state !== "RUNNING",
              text: "Stop Channel",
            },
          ]}
          variant="icon"
        />
      ),
    },
  ];

  const { items, collectionProps, filterProps, paginationProps } =
    useCollection(channels ?? [], {
      filtering: {
        empty: (
          <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
            <b>No channels</b>
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
          sortingColumn: columnDefinitions.find((col) => col.id === "name")!,
        },
      },
      selection: {},
    });

  const handleClick = ({
    detail,
    item,
  }: {
    detail: ButtonGroupProps.ItemClickDetails;
    item: ChannelIngestion;
  }) => {
    setSelectedItem(item);
    setActionId(detail.id);
    setModalVisible(true);
  };

  return (
    <>
      <Table
        {...collectionProps}
        variant="borderless"
        loadingText="Loading resources"
        loading={isLoading}
        trackBy="id"
        header={<Header>MediaLive HLS Channels</Header>}
        columnDefinitions={columnDefinitions}
        columnDisplay={preferences.contentDisplay}
        contentDensity="compact"
        stickyColumns={{ first: 0, last: 1 }}
        items={items}
        pagination={<Pagination {...paginationProps} />}
        filter={<TextFilter {...filterProps} />}
      />
      {
        {
          ingest: (
            <HlsIngestModal
              modalVisible={modalVisible}
              setModalVisible={setModalVisible}
              idPrefix={`medialive-${selectedItem?.id ?? ""}`}
              manifestUri={selectedItem?.manifestUri ?? ""}
              manifestWarningText={
                selectedItem?.manifestExists
                  ? "Content already exists in this location.  Starting ingest now will ingest this into TAMS.  If you are setting up a new ingest process then you may wish to delete the existing content before starting the ingest process."
                  : undefined
              }
              onDismiss={() => setSelectedItem(undefined)}
            />
          ),
          start: (
            <ConfirmationModal
              modalVisible={modalVisible}
              setModalVisible={setModalVisible}
              channelId={selectedItem?.id}
              setSelectedItem={setSelectedItem}
              actionId={actionId}
              setActionId={setActionId}
            />
          ),
          stop: (
            <ConfirmationModal
              modalVisible={modalVisible}
              setModalVisible={setModalVisible}
              channelId={selectedItem?.id}
              setSelectedItem={setSelectedItem}
              actionId={actionId}
              setActionId={setActionId}
            />
          ),
        }[actionId]
      }
    </>
  );
};

export default MediaLiveHlsIngestion;
