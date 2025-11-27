import { useState, useMemo } from "react";
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
import StartIngestModal from "./components/StartIngestModal";
import ConfirmationModal from "./components/ConfirmationModal";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { useChannels } from "@/hooks/useChannels";

const MediaLiveHlsIngestion = () => {
  const { channels, isLoading } = useChannels();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState();
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
  const columnDefinitions = useMemo(() => [
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
        <StatusIndicator type={STATUS_MAPPINGS[item.state]}>
          {item.state}
        </StatusIndicator>
      ),
      sortingField: "state",
    },
    {
      id: "button",
      cell: (item) => (
        <ButtonGroup
          onItemClick={({ detail }) => handleClick({ detail, item })}
          items={[
            {
              type: "icon-button",
              id: "ingest",
              iconName: "add-plus",
              disabled: !item.manifestUri,
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
  ]);
  const { items, collectionProps, filterProps, paginationProps } =
    useCollection(isLoading ? [] : channels, {
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
          sortingColumn: columnDefinitions.find((col) => col.id === "name"),
        },
      },
      selection: {},
    });

  const handleClick = ({ detail, item }) => {
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
            <StartIngestModal
              modalVisible={modalVisible}
              setModalVisible={setModalVisible}
              selectedItem={selectedItem}
              setSelectedItem={setSelectedItem}
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
