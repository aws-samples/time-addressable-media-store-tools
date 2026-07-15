# Replication Configuration

## Replication Connections Parameter

**CloudFormation Output:** `ReplicationConnectionsParameter`
**Component:** Replication (deployed when `DeployReplication` = "Yes")

This parameter defines available TAMS store connections for replication operations, enabling content replication between different TAMS instances.

## Parameter Structure

```json
{
  "Connection Display Name": {
    "endpoint": "https://api.target-tams.example.com",
    "connectionArn": "arn:aws:events:region:account:connection/connection-name"
  }
}
```

## Default Value

The parameter is created with an empty JSON object `{}` and must be configured manually to enable replication functionality.

## Usage

- Connections appear in the replication modal dropdown
- Used for one-off batch replication, creating live replication rules, and deleting replication rules
- Supports replication of flows and sources between TAMS stores

## Adding Replication Connections

### Step 1: Create EventBridge Connection

First, create an EventBridge connection to the target TAMS store:

1. Navigate to Amazon EventBridge in the AWS Console
2. Go to "Connections" and click "Create connection"
3. Configure OAuth client credentials for the target TAMS API
4. Note the connection ARN

### Step 2: Update Parameter

1. Navigate to AWS Systems Manager Parameter Store
2. Find the parameter using the `ReplicationConnectionsParameter` CloudFormation output value
3. Update the JSON with connection details

## Example Configuration

```json
{
  "Production TAMS": {
    "endpoint": "https://api.prod-tams.example.com",
    "connectionArn": "arn:aws:events:us-east-1:123456789012:connection/prod-tams-connection"
  },
  "Staging TAMS": {
    "endpoint": "https://api.staging-tams.example.com",
    "connectionArn": "arn:aws:events:us-east-1:123456789012:connection/staging-tams-connection"
  },
  "Archive TAMS": {
    "endpoint": "https://api.archive-tams.example.com",
    "connectionArn": "arn:aws:events:eu-west-1:123456789012:connection/archive-tams-connection"
  }
}
```

## Replication Operations

Once connections are configured, the following operations are available:

### One-off Batch Replication

- Replicates existing content from source to target TAMS store
- Supports optional timerange filtering
- Executes immediately

### Create Live Replication

- Sets up ongoing replication rules
- Automatically replicates new content as it's ingested
- Creates webhook endpoints for real-time synchronization

### Delete Live Replication

- Removes existing replication rules
- Stops ongoing replication for specified flows/sources

## Connection Requirements

Target TAMS stores must:

- Be accessible via HTTPS
- Support OAuth client credentials authentication
- Have compatible API versions
- Allow cross-origin requests from the replication source

## Security Considerations

- EventBridge connections store credentials securely
- Use least-privilege IAM policies for replication operations
- Monitor replication activities through CloudWatch logs
- Consider network security groups and VPC configurations
