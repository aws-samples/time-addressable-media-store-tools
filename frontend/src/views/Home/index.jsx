import ReactMarkdown from "react-markdown";
import { TextContent } from "@cloudscape-design/components";
import remarkGfm from "remark-gfm";
import {
  IS_HLS_DEPLOYED,
  IS_HLS_INGEST_DEPLOYED,
  IS_FFMPEG_DEPLOYED,
  IS_REPLICATION_DEPLOYED,
  IS_MEDIACONVERT_DEPLOYED,
  HAS_OMAKASE_EXPORT_CAPABILITY,
  IS_LOOP_RECORDER_DEPLOYED,
} from "@/constants";

const Home = () => {
  const markdown = `
  # TAMS UI

  This simple web application is designed to help visualise the content of the TAMS store.

  You can use the menu area on the left hand side of this page to navigate between different areas of the application.

  ## Core Features

  - **Sources** shows the current sources in the TAMS store. You can select individual items to view more details${
    IS_REPLICATION_DEPLOYED
      ? ", create MediaConvert jobs, and access replication functionality"
      : IS_MEDIACONVERT_DEPLOYED
      ? " and create MediaConvert jobs"
      : ""
  }.
  - **Flows** shows the current flows in the TAMS store. You can select individual items to view more details${
    IS_REPLICATION_DEPLOYED
      ? ", create exports, and manage replication workflows"
      : HAS_OMAKASE_EXPORT_CAPABILITY
      ? " and create exports"
      : ""
  }.

  On each of these pages you can access:
  - **Diagram View** - Visual representation of TAMS entities and their relationships.${
    IS_HLS_DEPLOYED
      ? `
  - **HLS Player** - Basic HLS video player and HLS Manifest API.`
      : ""
  }
  - **Omakase Player** - Advanced video player with timeline${
    HAS_OMAKASE_EXPORT_CAPABILITY
      ? ", markers, and export capabilities"
      : " and markers"
  }.${
    IS_REPLICATION_DEPLOYED
      ? `
  - **Replication** - Copy sources/flows between different TAMS stores.`
      : ""
  }

  ${
    IS_HLS_INGEST_DEPLOYED
      ? `
  ## Ingest Components

  - **MediaLive Channels** shows a list of AWS Elemental MediaLive Channels. You can choose to Ingest the channel and/or start/stop the Channel.
  - **MediaConvert Jobs** (Ingest) shows a list of AWS Elemental MediaConvert Jobs. You can choose to Ingest the job.
  - **HLS Ingests** shows a list of HLS Ingest Jobs and their status. You can also create a new HLS Ingest job.

  > **NOTE**: The Ingest workflow for both MediaLive and MediaConvert uses the HLS manifest file produced by those services to determine how and what to ingest. Therefore only output types of HLS for Channels and Jobs will support ingest.`
      : ""
  }
${
  IS_FFMPEG_DEPLOYED
    ? `
  ## FFmpeg Components

  - **FFmpeg - Export** shows a list of FFmpeg exports that have been triggered and their status. You can also download the results from here.
  - **FFmpeg - Rules** shows a list of event driven FFmpeg Conversion Rules that are setup. They can be reviewed and deleted from here.
  - **FFmpeg - Jobs** shows a list of batch FFmpeg Conversion Jobs that have been triggered. They can be reviewed from here.`
    : ""
}

${
  IS_MEDIACONVERT_DEPLOYED
    ? `
  ## MediaConvert Integration

  - **MediaConvert Jobs** shows a list of AWS Elemental MediaConvert Jobs with detailed status information, progress tracking, and job specifications. You can monitor job execution and view comprehensive job details.
  - **Create MediaConvert Jobs** from TAMS sources using the export functionality, allowing you to process TAMS content through MediaConvert workflows.`
    : ""
}

${
  HAS_OMAKASE_EXPORT_CAPABILITY || IS_FFMPEG_DEPLOYED
    ? `
  ## Advanced Features

  ### Export Operations
  ${
    IS_FFMPEG_DEPLOYED
      ? "Export operations are dynamically configurable through AWS Systems Manager Parameter Store. "
      : ""
  }The system supports:${
        IS_MEDIACONVERT_DEPLOYED
          ? `
  - **MediaConvert Export** - Create MediaConvert jobs directly from TAMS content`
          : ""
      }${
        IS_FFMPEG_DEPLOYED
          ? `
  - **Custom Export Operations** - Configurable FFmpeg-based export workflows defined in SSM parameters`
          : ""
      }

  ${
    HAS_OMAKASE_EXPORT_CAPABILITY
      ? `
  ### Edit-by-Reference
  The solution supports non-destructive editing workflows, allowing you to work with TAMS content without modifying the original media.`
      : ""
  }`
    : ""
}

${
  IS_REPLICATION_DEPLOYED
    ? `
  ### Replication
  Replicate sources and flows between different TAMS stores with support for:
  - One-off batch replication
  - Live replication rules
  - Configurable connection management`
    : ""
}
${IS_HLS_DEPLOYED || IS_LOOP_RECORDER_DEPLOYED ? `
  ## Special Tags
${IS_HLS_DEPLOYED || IS_LOOP_RECORDER_DEPLOYED ? `
  ### TAMS Flow Tags

  | Tag Key                  | Type     | Notes |
  | ------------------------ | -------- | ----- |${IS_HLS_DEPLOYED ? `
  | ***flow_status***        | _string_ | Used to control whether the **ENDLIST** line is present in the HLS manifest. Set this tag value to **ingesting** to exclude the line. |
  | ***hls_segments***       | _number_ | Used to limit the number of segments presented in the HLS manifest. Defaults to **150** if tag not set. Use the value **inf** to list all segments. However, listing all segments may result in the generation of the HLS manifest timing out. |
  | ***hls_exclude***        | _bool_   | Used to indicate the flow should be excluded from HLS manifest generation. |` : ""}${IS_LOOP_RECORDER_DEPLOYED ? `
  | ***loop_recorder_duration*** | _number_ | Used by the Loop Recorder to automatically manage flow duration by deleting older segments when flows exceed the specified duration (in seconds). |` : ""}` : ""}
${IS_HLS_DEPLOYED ? `
  ### TAMS Source Tags

  | Tag Key                  | Type     | Notes |
  | ------------------------ | -------- | ----- |
  | ***hls_exclude***        | _bool_   | Used to indicate the source should be excluded from HLS manifest generation. This option includes exclusion from the Omakase Player. |` : ""}` : ""}
  `;

  return (
    <TextContent>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </TextContent>
  );
};

export default Home;
