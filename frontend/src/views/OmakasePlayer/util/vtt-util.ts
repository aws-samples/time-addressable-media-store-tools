//@ts-ignore
import * as webvtt from "node-webvtt";

async function fetchVttUtf8(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${url}`);
  const buffer = await res.arrayBuffer();
  return new TextDecoder("utf-8").decode(buffer);
}

function formatSecondsToVttTimestamp(seconds: number): string {
  if (seconds < 0) seconds = 0;

  const h = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0");

  const m = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");

  const s = (seconds % 60).toFixed(3).padStart(6, "0");

  return `${h}:${m}:${s}`;
}

export async function mergeVttUrls(
  urls: string[],
  localOffsetSeconds: number,
  videoDuration: number
): Promise<string> {
  if (!urls.length) throw new Error("No URLs provided");

  function shiftTimestamp(
    time: number,
    offsetSeconds: number,
    videoDuration: number
  ): number {
    return Math.min(time - offsetSeconds, videoDuration);
  }

  function filterCue(
    startTime: number,
    offsetSeconds: number,
    videoDuration: number
  ): boolean {
    return (
      startTime >= offsetSeconds && startTime <= videoDuration + offsetSeconds
    );
  }

  const contents = await Promise.all(urls.map(fetchVttUtf8));

  const allCues = [];
  let metadata;

  for (const text of contents) {
    const parsed = webvtt.parse(text, { strict: false, meta: true });

    if (!metadata) {
      metadata = parsed.meta;
    }

    const filteredCues = parsed.cues.filter((cue: any) =>
      filterCue(cue.end, localOffsetSeconds, videoDuration)
    );

    for (const cue of filteredCues) {
      allCues.push({
        ...cue,
        start: shiftTimestamp(cue.start, localOffsetSeconds, videoDuration),
        end: shiftTimestamp(cue.end, localOffsetSeconds, videoDuration),
      });
    }
  }

  const final: string[] = [];

  final.push("WEBVTT");

  if (metadata["X-TIMESTAMP-MAP=LOCAL"]) {
    final.push(`X-TIMESTAMP-MAP=LOCAL${metadata["X-TIMESTAMP-MAP=LOCAL"]}`);
    final.push(""); // blank line after metadata
  } else {
    final.push("");
  }

  for (const cue of allCues) {
    final.push(
      `${formatSecondsToVttTimestamp(
        cue.start
      )} --> ${formatSecondsToVttTimestamp(cue.end)}`
    );
    final.push(cue.text);
    final.push(""); // blank line between cues
  }

  const vtt = final.join("\n").trim() + "\n";

  const blob = new Blob([vtt], { type: "text/vtt" });
  return URL.createObjectURL(blob);
}
