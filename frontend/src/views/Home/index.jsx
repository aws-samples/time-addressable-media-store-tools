import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const Home = () => {
  const markdown = `
  # TAMS UI

  This simple web application is designed to help visualise the content of the TAMS store.

  You can use the menu area on the left hand side of this page to navigate between different areas of the application.

  - **Sources** shows the current sources in the TAMS store. You are able to select individual items to view more details about them.
  - **Flows** shows the current flows in the TAMS store. You are able to select individual items to view more details about them.

  On each of these pages there is a link at the top which will show you an HLS Player representing your chosen item or a diagram to better visualise the associated TAMS entities.

  - **MediaLive Channels** shows a list of AWS Elemental MediaLive Channels. You can choose to setup (or remove) an Ingest workflow and/or start/stop the Channel.

  > **NOTE**: In order to ingest content from a MediaLive Channel into TAMS it needs both an Ingest Workflow running and the Channel to be running.

  - **MediaConvert Jobs** shows a list of AWS Elemental MediaConvert Jobs. It shows the status of the job(s) and a link to the Source that it was ingested against.

  ## MediaConvert Ingestion

  In order to ingest a MediaConvert job you will need to provide 2 things:

  - A MediaConvert Job JSON specification file. This file MUST be named \`mediaconvert.json\` and be placed in a sub-folder of the \`uploads\` folder of the **MediaConvertBucketName** bucket that was created during deployment.
  - A Media file to be ingested. This file should be placed in the same sub-folder as the job \`mediaconvert.json\` file (this controls which job settings will be used for the ingestion).

  ***IMPORTANT: The underscore character should not be used in the naming of the folder or the media file name. Doing so will prevent the ingest from running.***

  ## Special Tags

  ### AWS MediaLive Channel Tags

  | Tag Key                  | Type   | Notes |
  | ------------------------ | ------ | ----- |
  | ***use_start_epoch***    | _bool_ | If set with a value of **true** then the timerange value for ingested segments will be EPOCH based. If it has a different value or is missing the timerange will be zero based |

  ### TAMS Flow Tags

  | Tag Key                  | Type     | Notes |
  | ------------------------ | -------- | ----- |
  | ***flow_status***        | _string_ | Used to control whether the **ENDLIST** line is present in the HLS manifest. Set this tag value to **ingesting** to exclude the line. |
  | ***hls_segments***       | _number_ | Used to limit the number of segments presented in the HLS manifest. Defaults to **150** if tag not set. Use the value **inf** to list all segments. However,listing all segments may result in the generation of the HLS manifest timing out. |
  | ***hls_exclude***        | _bool_   | Used to indicate the flow should be excluded from HLS manifest generation. |

  ### TAMS Source Tags

  | Tag Key                  | Type     | Notes |
  | ------------------------ | -------- | ----- |
  | ***hls_exclude***        | _bool_   | Used to indicate the source should be excluded from HLS manifest generation.
  `;

  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>;
};

export default Home;
