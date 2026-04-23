# HLS Configuration

## HLS Codec Mappings Parameter

**CloudFormation Output:** `HlsCodecsParameter`  
**Component:** HLS API (deployed when `DeployHlsApi` = "Yes")

This parameter defines bidirectional codec mappings between TAMS format identifiers and HLS codec strings, used for both HLS manifest generation and HLS content ingestion.

## Parameter Structure

Each entry maps one codec across three naming schemes:

- `tams` — the TAMS MIME type (e.g. `audio/aac`)
- `hls` — the HLS codec identifier as it appears in `CODECS` attributes (e.g. `mp4a`)
- `ffprobe` — the codec name as reported by ffprobe's `codec_name` field (e.g. `aac`). Used as a fallback when an HLS manifest's `CODECS` attribute doesn't declare the audio codec.

```json
[
  {
    "tams": "audio/aac",
    "hls": "mp4a",
    "ffprobe": "aac"
  },
  {
    "tams": "video/h264",
    "hls": "avc1",
    "ffprobe": "h264"
  },
  {
    "tams": "text/vtt",
    "hls": "webvtt",
    "ffprobe": "webvtt"
  }
]
```

## Default Mappings

The parameter is created with these default codec mappings:

- **audio/aac** ↔ **mp4a** (HLS) / **aac** (ffprobe) — AAC audio
- **video/h264** ↔ **avc1** (HLS) / **h264** (ffprobe) — H.264 video
- **text/vtt** ↔ **webvtt** (HLS) / **webvtt** (ffprobe) — WebVTT subtitles

## Usage

### HLS Generation

- Used by HLS API Lambda function to translate TAMS codec identifiers to HLS-compatible codec strings
- Applied during HLS manifest generation for sources and flows

### HLS Ingestion

- The `hls` key is the primary lookup — HLS manifest `CODECS` values are translated to TAMS format identifiers during ingest
- The `ffprobe` key is used as a fallback when a manifest's `CODECS` attribute is incomplete (for example, audio renditions referenced via `AUDIO=` group but not declared in `CODECS`). The ingester probes the first media segment with ffprobe and resolves the codec from its reported `codec_name`
- Applied when ingesting HLS content to create TAMS flows with correct codec metadata

### Supported Codecs

- Supports audio, video, and subtitle codec mappings
- Handles codec-specific essence parameters (for example, AVC profile/level, AAC object type)

## Customization

To add or modify codec mappings:

1. Navigate to AWS Systems Manager Parameter Store
2. Find the parameter using the `HlsCodecsParameter` CloudFormation output value
3. Edit the JSON array to add new mappings or modify existing ones
4. Changes take effect immediately for new HLS requests

## Example Custom Mapping

```json
[
  {
    "tams": "audio/aac",
    "hls": "mp4a",
    "ffprobe": "aac"
  },
  {
    "tams": "video/h264",
    "hls": "avc1",
    "ffprobe": "h264"
  },
  {
    "tams": "video/h265",
    "hls": "hev1",
    "ffprobe": "hevc"
  },
  {
    "tams": "text/vtt",
    "hls": "webvtt",
    "ffprobe": "webvtt"
  }
]
```
