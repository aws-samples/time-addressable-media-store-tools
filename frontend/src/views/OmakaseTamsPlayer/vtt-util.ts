// @ts-expect-error - node-webvtt doesn't have type definitions
import * as webvtt from "node-webvtt";

type VttCue = {
  start: number;
  end: number;
  text: string;
  [key: string]: unknown;
};

type VttMetadata = {
  [key: string]: unknown;
};

const fetchVttUtf8 = async (url: string): Promise<string> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${url}`);
  const buffer = await res.arrayBuffer();
  return new TextDecoder("utf-8").decode(buffer);
};

const formatSecondsToVttTimestamp = (seconds: number): string => {
  if (seconds < 0) seconds = 0;

  const h = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0");

  const m = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");

  const s = (seconds % 60).toFixed(3).padStart(6, "0");

  return `${h}:${m}:${s}`;
};

export const mergeVttManifest = async (
  manifestUrl: string,
  videoDuration: number,
): Promise<string> => {
  const manifestRes = await fetch(manifestUrl);
  if (!manifestRes.ok) {
    throw new Error(
      `Failed to fetch manifest: ${manifestRes.status} ${manifestRes.statusText}`,
    );
  }

  const manifestText = await manifestRes.text();
  if (!manifestText.trim()) throw new Error("Empty manifest text");

  const vttUrls: string[] = [];
  const lines = manifestText.split("\n");

  const masterUrl = new URL(manifestUrl);
  const host = `${
    masterUrl.protocol === "blob:" ? masterUrl.protocol : ""
  }${masterUrl.origin}`;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const vttUrl = `${host}/${trimmed}`;
      vttUrls.push(vttUrl);
    }
  }

  if (!vttUrls.length) throw new Error("No VTT files found in manifest");

  const contents = await Promise.all(vttUrls.map(fetchVttUtf8));

  const allCues: VttCue[] = [];
  let metadata: VttMetadata | undefined;

  for (const text of contents) {
    const parsed = webvtt.parse(text, { strict: false, meta: true });

    if (!metadata) metadata = parsed.meta;

    for (const cue of parsed.cues) {
      allCues.push({
        ...cue,
        start: Math.max(0, Math.min(cue.start, videoDuration)),
        end: Math.max(0, Math.min(cue.end, videoDuration)),
      });
    }
  }

  const final: string[] = [];
  final.push("WEBVTT");

  if (metadata?.["X-TIMESTAMP-MAP=LOCAL"]) {
    final.push(`X-TIMESTAMP-MAP=LOCAL${metadata["X-TIMESTAMP-MAP=LOCAL"]}`);
    final.push("");
  } else {
    final.push("");
  }

  for (const cue of allCues) {
    final.push(
      `${formatSecondsToVttTimestamp(cue.start)} --> ${formatSecondsToVttTimestamp(cue.end)}`,
    );
    final.push(cue.text);
    final.push("");
  }

  const vtt = final.join("\n").trim() + "\n";
  const blob = new Blob([vtt], { type: "text/vtt" });
  return URL.createObjectURL(blob);
};
