# Time-addressable Media Store Tools

This solution contains a Web UI and associated tools to be used to help adoption and understanding of the AWS implementation of the [BBC TAMS API](https://github.com/bbc/tams). AWS have created an open source sample implementation of that API [here](https://github.com/awslabs/time-addressable-media-store).  This solution is designed to be used with that implementation.

**NOTE: This solution is not designed to be used in a Production environment. It is designed for dev use cases where a tool is required to help visualise the contents of a TAMS store.**

## Pre-requisites

This solution requires a running deployment of the [TAMS API](https://github.com/awslabs/time-addressable-media-store).

To build and run the Web UI frontend you will also need:

- npm
- node

## Deploy the required infrastructure

The Serverless Application Model Command Line Interface (SAM CLI) is an extension of the AWS CLI that adds functionality for building and testing Lambda applications. It uses Docker to run your functions in an Amazon Linux environment that matches Lambda. It can also emulate your application's build environment and API.

To use the SAM CLI, you need the following tools.

- SAM CLI - [Install the SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html)
- Docker - [Install Docker community edition](https://hub.docker.com/search/?type=edition&offering=community)

To build and deploy the infrastructure for the first time, run the following in your shell:

```bash
cd backend
sam build --use-container
sam deploy --guided --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND
```

The first command will build the source of your application. The second command will package and deploy your application to AWS, with a series of prompts:

- **Stack Name**: The name of the stack to deploy to CloudFormation. This should be unique to your account and region, and a good starting point would be something matching your project name.
- **AWS Region**: The AWS region you want to deploy your app to.
- **ApiStackName**: Supply the name of the CloudFormation stack used to deploy the TAMS API.
- **DeployHlsApi**: Defines whether to deploy the HLS component. **Leave the default value of `No`.**
- **DeployIngestHls**: Defines whether to deploy the HLS ingest component. **Leave the default value of `No`.**
- **DeployIngestFfmpeg**: Defines whether to deploy the FFMPEG based transcode component. **Leave the default value of `No`.**
- **DeployReplication**: Defines whether to deploy the replication component. **Leave the default value of `No`.**
- **Confirm changes before deploy**: If set to yes, any change sets will be shown to you before execution for manual review. If set to no, the AWS SAM CLI will automatically deploy application changes.
- **Allow SAM CLI IAM role creation**: Many AWS SAM templates, including this example, create AWS IAM roles required for the AWS Lambda function(s) included to access AWS services. By default, these are scoped down to minimum required permissions. To deploy an AWS CloudFormation stack which creates or modifies IAM roles, the `CAPABILITY_IAM` value for `capabilities` must be provided. If permission isn't provided through this prompt, to deploy this example you must explicitly pass `--capabilities CAPABILITY_IAM` to the `sam deploy` command.
- **Save arguments to samconfig.toml**: If set to yes, your choices will be saved to a configuration file inside the project, so that in the future you can just re-run `sam deploy` without parameters to deploy changes to your application.

The deployment will only take a short time as with all the components set to No there is no Infrastructure to deploy.

## Configure and build the Web UI frontend

```bash
cd ../frontend
npm ci
cp .env.template .env.local
```

Open the newly created `env.local` file in your preferred text editor and set the values for the non-commented out variables, leave the commented out lines for now. The values for these variables are provided as outputs from two different CloudFormation stacks:

1. **TAMS API stack** - The CloudFormation stack from the separate [TAMS API project](https://github.com/awslabs/time-addressable-media-store) that you deployed as a prerequisite
2. **TAMS Tools stack** - The CloudFormation stack created when you deployed this tools project

The variable names in the template file show the corresponding CloudFormation output names between `<` and `>` brackets as placeholders (for example, `<UserPoolId>` corresponds to the `UserPoolId` output from the TAMS API stack).

### Required Environment Variables

The following variables must be configured for basic functionality. Values come from outputs of two different CloudFormation stacks:

- **VITE_APP_AWS_REGION**: The AWS region where your TAMS API is deployed
- **VITE_APP_AWS_USER_POOL_ID**: From **TAMS API stack** output `UserPoolId`
- **VITE_APP_AWS_USER_POOL_CLIENT_WEB_ID**: From **TAMS API stack** output `UserPoolClientWebId`
- **VITE_APP_AWS_IDENTITY_POOL_ID**: From **TAMS API stack** output `IdentityPoolId`
- **VITE_APP_AWS_API_ENDPOINT**: From **TAMS API stack** output `ApiEndpoint`
- **VITE_APP_OMAKASE_EXPORT_EVENT_BUS**: From **TAMS Tools stack** output `OmakaseExportEventBus`
- **VITE_APP_OMAKASE_EXPORT_EVENT_PARAMETER**: From **TAMS Tools stack** output `OmakaseExportEventParameter`
- **VITE_APP_TAMS_AUTH_CONNECTION_ARN**: From **TAMS Tools stack** output `TamsAuthConnectionArn`
- **VITE_APP_AWS_MEDIACONVERT_ROLE_ARN**: From **TAMS Tools stack** output `MediaConvertRoleArn`
- **VITE_APP_AWS_MEDIACONVERT_BUCKET**: From **TAMS Tools stack** output `MediaConvertBucket`

Once you have set these values save the changes to the file. You now have 2 choices:

### Run the web app locally in dev mode

To do this run the following command:

```bash
npm run dev
```

### Build and deploy the web app to a web server

To do this run the following command:

```bash
npm run build
```

Then take the contents of the `dist` subfolder and place this on the web server of your choosing.

## Usage

In the initial state the Web App will have a simple interface. This allows you to browse and view the basic data held in your TAMS store. It also includes MediaConvert job management and enhanced export capabilities.

Four optional components can be deployed to the infrastructure to add additional functionality. The deployment of these components is expected to be done from the AWS CloudFormation Console. Changes should be made by updating the stack parameters for the CloudFormation Stack created for the infrastructure.

**NOTE: The Web UI is authenticated using the same Cognito User Pool used by the TAMS API. To login you will first need to create a user in Cognito.**

### Core Features

The solution now includes several core features available without deploying optional components:

#### MediaConvert Integration

- **MediaConvert Jobs View**: Browse and monitor AWS Elemental MediaConvert jobs that use TAMS as input
- **Job Details**: View detailed information about MediaConvert job status, progress, and configuration
- **Export Integration**: Create MediaConvert jobs directly from TAMS content through the export modal

#### Enhanced Export Modal

The export modal now supports dynamic, configurable export operations. Export operations are defined in a JSON configuration stored in AWS Systems Manager Parameter Store. See the [Export Modal Configuration](#export-modal-configuration) section for details on how to configure custom export operations.

#### Edit-by-Reference Support

The solution includes edit-by-reference functionality that allows for non-destructive editing workflows with TAMS content.

### Optional Components

This solution includes 5 optional components. They can be deployed by performing an update on the CloudFormation Stack and changing the relevant Yes/No option.

#### DeployHlsApi

This will deploy a HLS API endpoint to the solution and enable a basic Video player in the WebUI that uses this HLS API to play TAMS content.

**Required Environment Variable:**

- `VITE_APP_AWS_HLS_OBJECT_LAMBDA_ACCESS_POINT_ARN` = **TAMS Tools stack** output `HlsObjectLambdaAccessPointArn`

#### DeployIngestHls

This will deploy an option in the WebUI to ingest content into TAMS. It supports ingestion from Elemental Media Live channels (filtered to show only channels with HLS as the first output) and Elemental Media Convert jobs (filtered to show only jobs with HLS as the first output that do not use TAMS as input). It also provides an option to ingest from an external HLS manifest URL.

**Required Environment Variables:**

- `VITE_APP_AWS_INGEST_CREATE_NEW_FLOW_ARN` = **TAMS Tools stack** output `IngestCreateNewFlowArn`
- `VITE_APP_AWS_HLS_INGEST_ENDPOINT` = **TAMS Tools stack** output `HlsIngestEndpoint`
- `VITE_APP_AWS_HLS_INGEST_ARN` = **TAMS Tools stack** output `HlsIngestArn`

#### DeployIngestFfmpeg

This will deploy an option in the WebUI to enable FFmpeg functionality, it supports both Export and Conversion. Conversions can be done as a Rule (event driven) or as a Job (batch mode).

**Required Environment Variables:**

- `VITE_APP_AWS_INGEST_CREATE_NEW_FLOW_ARN` = **TAMS Tools stack** output `IngestCreateNewFlowArn`
- `VITE_APP_AWS_FFMPEG_ENDPOINT` = **TAMS Tools stack** output `FfmpegEndpoint`
- `VITE_APP_AWS_FFMPEG_COMMANDS_PARAMETER` = **TAMS Tools stack** output `FfmpegCommandsParameter`
- `VITE_APP_AWS_FFMPEG_BATCH_ARN` = **TAMS Tools stack** output `FfmpegBatchArn`
- `VITE_APP_AWS_FFMPEG_EXPORT_ARN` = **TAMS Tools stack** output `FfmpegExportArn`

#### DeployReplication

This will deploy replication functionality to the solution, enabling content replication workflows between TAMS stores or external systems.

**Required Environment Variables:**

- `VITE_APP_AWS_REPLICATION_CONNECTIONS_PARAMETER` = **TAMS Tools stack** output `ReplicationConnectionsParameter`
- `VITE_APP_AWS_REPLICATION_BATCH_ARN` = **TAMS Tools stack** output `ReplicationBatchArn`
- `VITE_APP_AWS_REPLICATION_CREATE_RULE_ARN` = **TAMS Tools stack** output `ReplicationCreateRuleArn`
- `VITE_APP_AWS_REPLICATION_DELETE_RULE_ARN` = **TAMS Tools stack** output `ReplicationDeleteRuleArn`

#### DeployLoopRecorder

This will deploy the Loop Recorder functionality to the solution. The Loop Recorder is an automated StateMachine that manages flow duration by automatically deleting older segments when flows exceed a specified duration. When a flow has a `loop_recorder_duration` tag (in seconds), the system monitors segment additions and removes segments from the beginning of the flow to maintain the specified duration limit.

**Note:** This component includes an Event Bridge rule that triggers for every `flows/segments_added` event, so it should only be deployed when loop recording functionality is required.

**No additional environment variables required** - the Loop Recorder operates automatically based on flow tags.

## SSM Parameters Configuration

TAMS Tools uses AWS Systems Manager (SSM) parameters for runtime configuration that can be modified post-deployment without requiring CloudFormation updates. These parameters allow you to customize the behavior and capabilities of different components.

### Available Parameters

| Parameter | Component | CloudFormation Output | Documentation |
|-----------|-----------|----------------------|---------------|
| Export Events Configuration | Core | `OmakaseExportEventParameter` | [docs/OMAKASE_EXPORT_SCHEMA.md](docs/OMAKASE_EXPORT_SCHEMA.md) |
| HLS Codec Mappings | HLS API | `HlsCodecsParameter` | [docs/HLS_CONFIGURATION.md](docs/HLS_CONFIGURATION.md) |
| FFmpeg Commands | FFmpeg Ingest | `FfmpegCommandsParameter` | [docs/FFMPEG_CONFIGURATION.md](docs/FFMPEG_CONFIGURATION.md) |
| Replication Connections | Replication | `ReplicationConnectionsParameter` | [docs/REPLICATION_CONFIGURATION.md](docs/REPLICATION_CONFIGURATION.md) |

### Parameter Access

Parameters are automatically created during deployment and can be found in AWS Systems Manager Parameter Store. Use the CloudFormation output values to reference the exact parameter names in your environment configuration.

For detailed configuration instructions for each parameter, see the linked documentation files above.

## Customisation

The application supports visual customisation to help differentiate between multiple TAMS Tools UI instances:

- **Application Title**: Customise the application title by setting the `VITE_APP_TITLE` environment variable. For example, use `VITE_APP_TITLE="My Custom TAMS Tools"`. If not set, defaults to "TAMS Tools".
- **Header Logo**: Customise the logo displayed in the header by setting the `VITE_APP_TITLE_LOGO` environment variable with the path to your image file. For example, use `VITE_APP_TITLE_LOGO="/my-logo.png"`. If not set, defaults to "/aws.svg". Place your image files in the `frontend/public/` directory to make them accessible.

## Cleanup

To delete the solution, use the SAM CLI, you can run the following:

```bash
sam delete
```

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.
