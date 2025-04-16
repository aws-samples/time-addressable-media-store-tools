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

const FfmpegRules = () => {
  const { rules, isLoading } = useRules();
  const [selectedKey, setSelectedKey] = useState("");
  const [modalVisible, setModalVisible] = useState(false);

  const columnDefinitions = [
    {
      id: "id",
      header: "Id",
      cell: (item) => <Link to={`/flows/${item.id}`}>{item.id}</Link>,
      sortingField: "id",
      isRowHeader: true,
    },
    {
      id: "command",
      header: "FFmpeg Command",
      cell: (item) =>  item.ffmpeg && Object.entries(item.ffmpeg?.command).map((arg) => arg.join(" ")).join(" "),
      sortingField: "command",
      maxWidth: 200,
    },
    {
      id: "outputFlow",
      header: "Destination Flow",
      cell: (item) => (
        <Link to={`/flows/${item.outputFlow}`}>
          {item.outputFlow}
        </Link>
      ),
      sortingField: "outputFlow",
    },
    {
      id: "delete",
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
    useCollection(isLoading ? [] : rules, {
      expandableRows: {
        getId: (item) => item.id,
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
      sorting: {},
      selection: {},
    });

  const handleDeleteRule = (key) => {
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
