# FFmpeg Configuration

## FFmpeg Commands Parameter

**CloudFormation Output:** `FfmpegCommandsParameter`
**Component:** FFmpeg Ingest (deployed when `DeployIngestFfmpeg` = "Yes")

This parameter defines available FFmpeg commands and their TAMS metadata for the Web UI, enabling custom transcoding and export operations.

## Parameter Structure

```json
{
  "Command Name": {
    "command": {
      "-option": "value",
      "-flag": null
    },
    "tams": {
      "property": "new_value",
      "property_to_delete": null
    }
  }
}
```

### Properties

- **command** (required): Dictionary of FFmpeg command-line options and their values. Use `null` for flags without values.
- **tams** (optional): Dictionary of TAMS flow properties to override when re-ingesting results back into TAMS.

### Command Behavior

- **With tams property**: Results are re-ingested as a new flow in TAMS with specified property overrides
- **Without tams property**: Results are exported to S3 files only (no re-ingestion)

### TAMS Property Overrides

The `tams` object follows the TAMS flow schema and allows you to:

- **Change a value**: Provide the property name and new value
- **Delete a property**: Provide the property name with `null` value
- **Leave unchanged**: Omit the property entirely

## Default Commands

The parameter includes these default FFmpeg commands:

### Thumbnail Generation

```json
"Thumbnail size image": {
  "command": {
    "-ss": "00:00:00",
    "-frames:v": "1",
    "-vf": "scale=320:180",
    "-qscale:v": "2",
    "-f": "image2"
  },
  "tams": {
    "description": "FFmpeg (Thumbnail)",
    "codec": "image/jpeg",
    "container": "image/jpeg",
    "format": "urn:x-tam:format:image",
    "essence_parameters": {
      "frame_width": 320,
      "frame_height": 180
    }
  }
}
```

### Proxy Video (1080p)

```json
"Proxy Video (1080)": {
  "command": {
    "-c:v": "libx264",
    "-copyts": null,
    "-vf": "scale=1920:1080",
    "-b:v": "5000k",
    "-f": "mpegts"
  },
  "tams": {
    "description": "FFmpeg (1080 Proxy Video)",
    "avg_bit_rate": 5000000,
    "max_bit_rate": 5000000,
    "essence_parameters.frame_width": 1920,
    "essence_parameters.frame_height": 1080
  }
}
```

### Export Formats

**MP4 Export** - Copy streams to MP4 container

```json
"MP4 Export": {
  "command": {
    "-c": "copy",
    "-f": "mp4"
  }
}
```

**TS Export** - Copy streams to MPEG-TS container

```json
"TS Export": {
  "command": {
    "-c": "copy",
    "-f": "mpegts"
  }
}
```

## Usage

- Commands appear in FFmpeg Rules and Jobs interfaces
- Used for both conversion rules (event-driven) and batch jobs
- TAMS metadata automatically applied to generated flows

## Adding Custom Commands

1. Navigate to AWS Systems Manager Parameter Store
2. Find the parameter using the `FfmpegCommandsParameter` CloudFormation output value
3. Add new command definitions following the JSON structure
4. Commands appear automatically in the Web UI

## Command Structure Details

### Command Object

- Contains FFmpeg command-line options as key-value pairs
- Use `null` for flags without values (for example, `"-copyts": null`)
- Defines the actual FFmpeg command that will be executed

### TAMS Object

- Optional property for commands that re-ingest results into TAMS
- Follows TAMS flow schema for property overrides
- Common properties: `description`, `codec`, `container`, `avg_bit_rate`, `max_bit_rate`, `essence_parameters`
- Use dot notation for nested properties (for example, `"essence_parameters.frame_width": 1920`)

## Example Custom Command

```json
"Custom H.265 Encode": {
  "command": {
    "-c:v": "libx265",
    "-preset": "medium",
    "-crf": "23",
    "-vf": "scale=1280:720",
    "-f": "mp4"
  },
  "tams": {
    "description": "H.265 720p Encode",
    "codec": "video/h265",
    "container": "video/mp4",
    "essence_parameters": {
      "frame_width": 1280,
      "frame_height": 720
    }
  }
}
```
