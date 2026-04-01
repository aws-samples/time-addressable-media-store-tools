import { useState } from "react";
import {
  Box,
  Button,
  Header,
  Pagination,
  Table,
  TextFilter,
} from "@cloudscape-design/components";
import DeleteModal from "./components/DeleteModal";
import { useRules } from "@/hooks/useFfmpeg";
import { PAGE_SIZE } from "@/constants";
import { Link } from "react-router-dom";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { RuleTarget } from "@/types/ingestFFmpeg";
import type { TableProps } from "@cloudscape-design/components";

type RuleItem =
  | { key: string; id: string; parentId: null }
  | ({ key: string; parentId: string } & RuleTarget);

const FfmpegRules = () => {
  const { rules, isLoading } = useRules();
  const [selectedKey, setSelectedKey] = useState("");
  const [modalVisible, setModalVisible] = useState(false);

  const columnDefinitions: TableProps.ColumnDefinition<RuleItem>[] = [
    {
      id: "id",
      header: "Origin Flow",
      cell: (item) =>
        item.parentId === null && (
          <Link to={`/flows/${item.id}`}>{item.id}</Link>
        ),
      sortingField: "id",
      isRowHeader: true,
    },
    {
      id: "command",
      header: "FFmpeg Command",
      cell: (item) =>
        item.parentId &&
        item.ffmpeg &&
        Object.entries(item.ffmpeg.command)
          .map((arg) => arg.join(" "))
          .join(" "),
      sortingField: "command",
      maxWidth: 200,
    },
    {
      id: "outputFlow",
      header: "Destination Flow",
      cell: (item) =>
        item.parentId && (
          <Link to={`/flows/${item.outputFlow}`}>{item.outputFlow}</Link>
        ),
      sortingField: "outputFlow",
    },
    {
      id: "delete",
      header: "",
      cell: (item) =>
        item.parentId && (
          <Button
            iconName="remove"
            fullWidth
            variant="icon"
            onClick={() => handleDeleteRule(item.key)}
          />
        ),
    },
  ];

  const { items, collectionProps, filterProps, paginationProps } =
    useCollection(rules ?? [], {
      expandableRows: {
        getId: (item) => item.key,
        getParentId: (item) => item.parentId,
      },
      filtering: {
        empty: (
          <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
            <b>No rules</b>
          </Box>
        ),
        noMatch: (
          <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
            <b>No matches</b>
          </Box>
        ),
      },
      pagination: { pageSize: PAGE_SIZE },
      sorting: {
        defaultState: {
          sortingColumn: columnDefinitions.find((col) => col.id === "id")!,
        },
      },
      selection: {},
    });

  const handleDeleteRule = (key: string) => {
    setSelectedKey(key);
    setModalVisible(true);
  };

  return (
    <>
      <Table
        {...collectionProps}
        variant="borderless"
        loadingText="Loading resources"
        loading={isLoading}
        trackBy="key"
        header={<Header>Rules</Header>}
        columnDefinitions={columnDefinitions}
        stickyColumns={{ first: 0, last: 1 }}
        items={items}
        isItemDisabled={(item) => !item.parentId}
        pagination={<Pagination {...paginationProps} />}
        filter={<TextFilter {...filterProps} />}
        contentDensity="compact"
        wrapLines
      />
      <DeleteModal
        modalVisible={modalVisible}
        setModalVisible={setModalVisible}
        selectedKey={selectedKey}
        setSelectedKey={setSelectedKey}
      />
    </>
  );
};

export default FfmpegRules;
