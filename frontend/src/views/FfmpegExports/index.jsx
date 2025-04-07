import useStore from "@/stores/useStore";
import { AWS_REGION, STATUS_MAPPINGS, PAGE_SIZE_PREFERENCE } from "@/constants";
import {
  Box,
  Button,
  CollectionPreferences,
  Link as ExternalLink,
  Header,
  Pagination,
  SpaceBetween,
  StatusIndicator,
  Table,
  TextFilter,
} from "@cloudscape-design/components";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { Link } from "react-router-dom";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { useExports } from "@/hooks/useFfmpeg";
import { fetchAuthSession } from "aws-amplify/auth";

const getPresignedUrl = (bucket, key, id) =>
  fetchAuthSession().then((session) => {
    const s3Client = new S3Client({
      region: AWS_REGION,
      credentials: session.credentials,
    });
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${id}.mp4"`,
    });
    return getSignedUrl(s3Client, command, { expiresIn: 300 });
  });

const handleDownload = async (item) => {
  const url = await getPresignedUrl(
    item.output.bucket,
    item.output.key,
    item.executionArn.split(":")[7]
  );
  window.location.href = url;
};

const columnDefinitions = [
  {
    id: "executionArn",
    header: "Execution Arn",
    cell: (item) => (
      <ExternalLink
        external
        href={`https://${AWS_REGION}.console.aws.amazon.com/states/home?region=${AWS_REGION}#/v2/executions/details/${item.executionArn}`}
      >
        {item.executionArn.split(":")[7]}
      </ExternalLink>
    ),
    sortingField: "executionArn",
    isRowHeader: true,
    width: 310,
  },
  {
    id: "timerange",
    header: "Timerange",
    cell: (item) => item.timerange,
    sortingField: "timerange",
    maxWidth: 160,
  },
  {
    id: "flowIds",
    header: "Flows",
    cell: (item) => (
      <SpaceBetween>
        {item.flowIds.map((flowId) => (
          <Link key={flowId} to={`/flows/${flowId}`}>
            {flowId}
          </Link>
        ))}
      </SpaceBetween>
    ),
    sortingField: "flowIds",
  },
  {
    id: "command",
    header: "FFmpeg Command",
    cell: (item) => item.ffmpeg?.command?.join(" "),
    sortingField: "command",
    maxWidth: 200,
  },
  {
    id: "outputFormat",
    header: "Output Format",
    cell: (item) => item.ffmpeg?.outputFormat,
    sortingField: "outputFormat",
    maxWidth: 100,
  },
  {
    id: "output",
    header: "Output",
    cell: (item) =>
      item.output.bucket && (
        <Button
          onClick={() => handleDownload(item)}
          iconName="download"
          variant="icon"
        />
      ),
    sortingField: "output",
    width: 80,
  },
  {
    id: "status",
    header: "Status",
    cell: (item) =>
      item.status && (
        <StatusIndicator type={STATUS_MAPPINGS[item.status]}>
          {item.status}
        </StatusIndicator>
      ),
    sortingField: "status",
  },
  {
    id: "startDate",
    header: "Start",
    cell: (item) => item.startDate,
    sortingField: "startDate",
  },
  {
    id: "stopDate",
    header: "Stop",
    cell: (item) => item.stopDate,
    sortingField: "stopDate",
  },
];
const collectionPreferencesProps = {
  pageSizePreference: PAGE_SIZE_PREFERENCE,
  contentDisplayPreference: {
    title: "Column preferences",
    description: "Customize the columns visibility and order.",
    options: columnDefinitions.map(({ id, header }) => ({
      id,
      label: header,
      alwaysVisible: id === "id",
    })),
  },
  cancelLabel: "Cancel",
  confirmLabel: "Confirm",
  title: "Preferences",
};

const FfmpegExports = () => {
  const preferences = useStore((state) => state.ffmpegExportsPreferences);
  const setPreferences = useStore((state) => state.setFfmpegExportsPreferences);
  const { exports, isLoading } = useExports();
  const { items, collectionProps, filterProps, paginationProps } =
    useCollection(isLoading ? [] : exports, {
      filtering: {
        empty: (
          <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
            <b>No exports</b>
          </Box>
        ),
        noMatch: (
          <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
            <b>No matches</b>
          </Box>
        ),
      },
      pagination: { pageSize: preferences.pageSize },
      sorting: {},
      selection: {},
    });

  return (
    <Table
      {...collectionProps}
      isItemDisabled={(item) => !item.Valid || loading}
      variant="borderless"
      wrapLines
      loadingText="Loading resources"
      loading={isLoading}
      trackBy="executionArn"
      header={<Header>Exports</Header>}
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
  );
};

export default FfmpegExports;
