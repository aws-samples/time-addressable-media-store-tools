import * as HLS from  "hls-parser"
import { mp2t } from "mux.js";

// Manifest Object to handle the manifest file.
export class Manifest {
  private segmentsList: Segment[];

  constructor(public file: File, public name: string, public type: string) {
    this.name = name;
    this.type = type;
    this.file = file;
    this.segmentsList = [];
  }

  getName() {
      return this.name;
  }

  getType() {
      return this.type;
  }

  addsegments(segment: Segment) {
    this.segmentsList.push(segment);
  }

  getSegments() {
    return this.segmentsList;
  }

  getFile() {
    return this.file;
  }

}

// FlowSegment object to handle the segments in the manifest file.
export class Segment {
  constructor(public file: File, public name:string, public extension: string, public type: string) {
    this.name = name;
    this.extension = extension;
    this.type = type;
    this.file = file;
  }

  getExtension() {
    return this.extension;
  }
  
  getName() {
    return this.name;
  }

  getType() {
    return this.type;
  }

  setFile(file: File) {
    this.file = file;
  }

  getFile() {
    return this.file;
  }
}

// Structure to pass data between modals
export type LocalIngestResult = {
  masterManifest: string;
  manifestList: ManifestList,
  uploadedFiles:  Map<string, Segment>;
  packageType: PackageType;
  };

// Manage the different manifests as a list
export type ManifestList = {
  video: Manifest[];
  audio: Manifest[];
};

// Media can be either video or audio
export type MediaType = "video" | "audio";
export type PackageType = "HLS" | "DASH";

// Utility function to identify the manifest type.
export const PackageTypeOptions = [
  { ext: "m3u8", type: "HLS", validate: (file) => 
          new Promise((resolve) => {
                                      const reader = new FileReader();
                                      reader.onload = (ev) => {resolve(ev.target.result.startsWith("#EXTM3U"));}
                                      reader.onerror = () => resolve(false);
                                      reader.readAsText(file);
                                  }),
  },
  { ext: "mpd", type: "DASH", validate: (file) => 
          new Promise((resolve) => {
                                      const reader = new FileReader();
                                      reader.onload = (ev) => {resolve(ev.target.result.includes("<MPD"));}
                                      reader.onerror = () => resolve(false);
                                      reader.readAsText(file);
                                  }),
  },
];

export const validateManifestFile = async (file) => {
  const fileExtension = file.name.split(".").pop().toLowerCase();
  console.debug("Validating manifest file with extension:", fileExtension);

  const packageOption = PackageTypeOptions.find((option) => option.ext === fileExtension);
  console.debug("Package option found for validation:", packageOption);
  if (packageOption) {
    const isValid = await packageOption.validate(file);
    console.debug("Manifest file validation result:", isValid);
    return isValid;
  }

  console.warn("No matching package option found for extension:", fileExtension);
  return false;
};

// Allowed Video file types and their magic numbers for validation.
const videoFileOptions = [
  { ext: "ts", type: "Transport Stream", magic: [0x47] },
  { ext: "mp4", type: "MP4 Video", magic: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70] },
  { ext: "mpeg", type: "MPEG Video", magic: [0x00, 0x00, 0x01, 0xBA] },
  { ext: "mpegts", type: "MPEG-TS Video", magic: [0x47] },
  { ext: "m4s", type: "M4S Video", magic: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70] },
]; 

// Allowed Audio file types and their magic numbers for validation.
const audioFileOptions = [
  { ext: "mp3", type: "MP3 Audio", magic: [0xFF, 0xF3] },
  { ext: "aac", type: "AAC Audio", magic: [0xFF, 0xF1] },
  { ext: "wav", type: "WAV Audio", magic: [0x52, 0x49, 0x46, 0x46] },
  { ext: "ac3", type: "AC3 Audio", magic: [0x0B, 0x77] },
  { ext: "ts", type: "TS Audio", magic: [0x47] },
];

export async function detectTsType(
  file: File
): Promise<"video" | "audio" | "both" | "unknown"> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  return new Promise((resolve) => {
    let hasVideo = false;
    let hasAudio = false;
    
    // Get a stream of TS packets
    const transport = new mp2t.TransportPacketStream();

    // Parse each packet to find out what it is.
    const parseStream = new mp2t.TransportParseStream();

    // actually process the TS packets using the parser above.
    transport.pipe(parseStream);

    console.log("PACKET:  ", transport);

    parseStream.on("data", (packet: any) => {

      console.debug("Stream Type:  ", packet.type);
      // Is this the PMT?
      if (packet.type !== "pmt") {
        return;
      }
      console.dir(packet);

      const pmt = packet.programMapTable;

      Object.entries(pmt).forEach(
        (pid, streamType) => {
          switch (streamType) {
              // Have we found video?
              case 0x1b: //H264
              case 0x24: // HEVC
              case 0x02: //MPEG2
                hasVideo = true;
                break;

              // Audio?
              case 0x0f: //AAC
              case 0x03: //MPEG1 audio
              case 0x04: // MPEG2 audio
              case 0x81: // AC3
                hasAudio = true;
                break;
            }              
        }
      );
    });

    transport.on("done", () => {
      if (hasVideo && hasAudio) {
        resolve("both");
      } else if (hasVideo) {
        resolve("video");
      } else if(hasAudio) {
        resolve("audio");
      } else {
        resolve("unknown");
      }      
    });

    transport.push(bytes);
    transport.flush();
  });
};

export const validateVideoFile = async (file) => {
  const fileExtension = file.name.split(".").pop().toLowerCase();
  console.debug("Validating video file with extension:", fileExtension);

  const videoOption = videoFileOptions.find((option) => option.ext === fileExtension);
  console.debug("Video option found for validation:", videoOption);
  console.debug("Extension:  ", fileExtension);

  if (videoOption) {

    if (fileExtension == "ts") {
      const type = await detectTsType(file);

      console.log("TYPE: ", type);

      return (
         type === "video" || type === "both"
      );
    } else {
        // If this is not a ts file then check if it might be a video file in some other format.
        const isValid = videoOption.magic ? await verifyMagicNumber(file, videoOption.magic) : true;
        console.debug("Video file validation result:", isValid);
        return isValid;   
    }
  }
  return false;

  console.warn("No matching video file option found for extension:", fileExtension);
  return false;
};

export const validateAudioFile = async (file) => {
  const fileExtension = file.name.split(".").pop().toLowerCase();
  console.debug("Validating audio file with extension:", fileExtension);

  const audioOption = audioFileOptions.find((option) => option.ext === fileExtension);
  console.debug("Audio option found for validation:", audioOption);
  if (audioOption) {

    if (fileExtension == "ts") {
        const type = await detectTsType(file);

        console.log("TYPE:  ", type);
        return (
          type === "audio" || type === "both"
        );
    } else {
        // If this is not a ts file then check to see if it is some other sort of audio file.
        const isValid = audioOption.magic ? await verifyMagicNumber(file, audioOption.magic) : true;
        console.debug("Audio file validation result:", isValid);
        return isValid;    
    }
    //return isValid;
  }

  console.warn("No matching audio file option found for extension:", fileExtension);
  return false;
};

// Utility function to verify the magic number of a file against an expected magic number.
export const verifyMagicNumber = (file, expectedMagic) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const fileHeader = new Uint8Array(ev.target.result).subarray(0, expectedMagic.length);
      const isValid = expectedMagic.every((byte, index) => fileHeader[index] === byte);
      resolve(isValid);
    };
    reader.onerror = () => resolve(false);
    reader.readAsArrayBuffer(file.slice(0, expectedMagic.length));
  });
};

const videoCodecList = [
  { id: "ts", codec: "video/ts", container: "video/mp2t", format: "urn:x-nmos:format:video" },
  { id: "mp4", codec: "video/mpd", container: "video/mpd", format: "urn:x-nmos:format:video" },
];

const audioCodecList = [
  { id: "ts", codec: "audio/aac", container: "audio/aac", format: "urn:x-nmos:format:audio" },
  { id: "mp4", codec: "audio/mpd", container: "audio/mpd", format: "urn:x-nmos:format:audio" },
];

export const parseVideoCodec = (codec) => {
  return videoCodecList.find((item) => item.id === codec);
};

export const parseAudioCodec = (codec) => {
  return audioCodecList.find((item) => item.id === codec);
};

const resolutionList = [
  { id: "1080p", width: 1920, height: 1080 },
  { id: "720p", width: 1280, height: 720 },
  { id: "480p", width: 854, height: 480 },
];

export const parseResolution = (resolution) => {
  return resolutionList.find((item) => item.id === resolution);
};

export const manifestType = async (manifest) => {
  const manifestFile = manifest.file;

  const manifestContent = await manifestFile.text();

  const parsedManifest = HLS.parse(manifestContent);

  console.debug(`Manifest we parsed::   `, parsedManifest);

  return parsedManifest;
}

export const isMasterManifest = (playList) => {
  return playList.isMasterPlaylist;  
}

export const isMediaManifest = (playList) => {
  if (!playList.isMasterPlaylist) {
    // Not a master Manifest! Is is a media manifest?
    return (Array.isArray(playList.segments) && playList.segments.length > 0);
  }
}

export const findMaster = async (manifestList) => {
  const masterManifests = [];

  for (const manifest of manifestList) {
    const manifestContent = await manifest.file.text();

    const parsedManifest = HLS.parse(manifestContent);
    if (isMasterManifest(parsedManifest)) {
      masterManifests.push(manifest);
    }
  }

  return masterManifests;
}

export const createMaster = (videoManifests, audioManifest) => {
  // create a master manifest using the provided list
  console.debug('Manifests: ', audioManifest[0].file.webkitRelativePath, videoManifests[0].file.webkitRelativePath);

  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:1"
  ];

  for (const video of videoManifests) {
    lines.push(
      '#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1920x1280,CODECS="mp4a.40.2,avc1.100.40",FRAME-RATE=24',
      video.file.webkitRelativePath
    );
    lines.push(
      '#EXT-X-STREAM-INF:BANDWIDTH=68000,CODECS="mp4a.40.2"',
      audioManifest[0].file.webkitRelativePath
    );
  }

  return lines.join("\n");
};