import * as HLS from  "hls-parser"

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
  manifestList: ManifestList,
  uploadedFiles:  Map<string, Segment>;
  packageType: PackageType;
  };

// This is what needs to get passeed back to HlsIngestModal when the user is done with the local ingest modal.
export type ManifestResult = {
  masterManifest?: string;
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

// These are the types we'd expect to see in an ES header.
const VIDEO_TYPES = new Set([
  0x1B,
  0x24,
  0x33,
]);

const AUDIO_TYPES = new Set([
  0x03,
  0x04,
  0x0F,
  0x11,
  0x81,
  0x87,
]);



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
export interface FileTypeOption {
  ext: string;
  type: string;
  magic: number[];
};

const videoFileOptions: FileTypeOption[] = [
  { ext: "ts", type: "Transport Stream", magic: [0x47] },
  { ext: "mp4", type: "MP4 Video", magic: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70] },
  { ext: "mpeg", type: "MPEG Video", magic: [0x00, 0x00, 0x01, 0xBA] },
  { ext: "mpegts", type: "MPEG-TS Video", magic: [0x47] },
  { ext: "m4s", type: "M4S Video", magic: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70] },
]; 

// Allowed Audio file types and their magic numbers for validation.
const audioFileOptions: FileTypeOption[] = [
  { ext: "mp3", type: "MP3 Audio", magic: [0xFF, 0xF3] },
  { ext: "aac", type: "AAC Audio", magic: [0xFF, 0xF1] },
  { ext: "wav", type: "WAV Audio", magic: [0x52, 0x49, 0x46, 0x46] },
  { ext: "ac3", type: "AC3 Audio", magic: [0x0B, 0x77] },
  { ext: "ts", type: "TS Audio", magic: [0x47] },
];

// Find the payload in a stream.
function getPayload(packet: Uint8Array): Uint8Array {

    const afc = (packet[3] >> 4) & 0x03;
    let offset = 4;

    if (afc === 2) {
        throw new Error("No payload");
    }

    if (afc === 3) {
        offset += packet[4] + 1;
    }

    return packet.subarray(offset);
}

// Interface for the function to detect stream type
export interface StreamType {
  hasAudio: boolean;
  hasVideo: boolean;
};

//##############################################################################################################//

export async function detectTsType(stream: Uint8Array): Promise<StreamType> {

  // Loop over packets looking for the PAT...
  function forEachPacket(
    data: Uint8Array,
    callback: (packet: Uint8Array) => boolean | void
    ) {
    for (let offset = 0; offset + 188 <= data.length; offset += 188) {
        const packet = data.subarray(offset, offset + 188);
        if (packet[0] !== 0x47) {
            throw new Error(`Sync lost at ${offset}`);
        }
        if (callback(packet) === true) {
            return;
        }
    }
  }
  
  // Look in the PAT to find the PMT PID.
  function findPMTPid(data: Uint8Array): number | null {
    let pmtPid: number | null = null;

    forEachPacket(data, packet => {
        const pid = ((packet[1] & 0x1f) << 8) | packet[2];
        if (pid !== 0) {
            return;
        }
        pmtPid = parsePAT(packet);
        return true;
    });
    return pmtPid;
  }

  // Find the PMT using the PID.
  function findPMT(data: Uint8Array, pmtPid: number): Uint8Array | null {

      let result: Uint8Array | null = null;

      forEachPacket(data, packet => {
          const pid = ((packet[1] & 0x1f) << 8) | packet[2];
          if (pid !== pmtPid) {
              return;
          }
          result = packet;
          return true;
      });

      // Return the actual PACKET for the PMT
      return result;
  }

  // Parse the PAT to find the PMT PID.
  function parsePAT(packet: Uint8Array):number|null {

      const payload = getPayload(packet);
      const pointer = payload[0];

      console.log(
          Array.from(payload.slice(0, 32))
              .map(b => b.toString(16).padStart(2, "0"))
              .join(" ")
      );

      let tableStart = 1 + pointer;
      const sectionLength = ((payload[tableStart + 1] & 0x0f) << 8) | payload[tableStart + 2];


      // Now set the end of the section....
      const sectionEnd = tableStart + 3 + sectionLength;
      // Need to remove the CRC part.
      const endOfPrograms = sectionEnd - 4;
      console.log(`Section length: ${sectionLength} starting at ${tableStart} ending at ${sectionEnd} with end of programs at ${endOfPrograms}`);      

      console.log("PAT: ", payload[tableStart]);
      // table_id
      if (payload[tableStart] !== 0x00) {
          throw new Error("Not a PAT");
      }

      // Declare the index we need
      let index = tableStart + 8;

      // We need to work our way through the (possible) list of PMTs
      while (index + 4 <= endOfPrograms) {
        const programNumber = (payload[index] << 8) | payload[index + 1];
        const pmtPid = ((payload[index + 2] & 0x1f) << 8) | payload[index + 3];

        console.log(`Program ${programNumber} -> PID ${pmtPid}`);

        if (programNumber !== 0) {
          return pmtPid;
        }
        index += 4;
      }

      return null;
  }

  // Look to see what streams a PMT points to.
  function parsePMT(packet: Uint8Array): StreamType {
      let hasAudio = false;
      let hasVideo = false;

      const payload = getPayload(packet);
      // pointer to table should be firt byte...
      // Calculate start of the section
      const sectionStart = 1 + payload[0];

      // We now should have the PMT
      const tableID = payload[sectionStart];

      console.log("PMT Table ID: ", tableID);
      
      if (tableID != 0x2) {
        throw new Error("Expected PMT");
      }

      const sectionLength = ((payload[sectionStart] & 0x0f) << 8) | payload[sectionStart + 1];
      const programInfoLength = ((payload[sectionStart + 10] & 0x0f) << 8) | payload[sectionStart + 11];

      // Start of the ES data.
      let pos = sectionStart + 12 + programInfoLength;

      // find end of the section
      const sectionEnd = sectionStart + 3 + sectionLength;

      // Work through the ES list checking types. Account for the CRC being part of the length stored.

      while (pos + 5 <= (sectionEnd - 4)) {
          const streamType = payload[pos];
          const esInfoLength = ((payload[pos + 3] & 0x0f) << 8) | payload[pos + 4];
          // Get PID for debug print
          const elemPid = ((payload[pos + 1] & 0x1f) << 8) | payload[pos + 2];

          console.log(`ES Type=ox${streamType.toString(16)}, PID=${elemPid}`);

          if (VIDEO_TYPES.has(streamType)) {
              hasVideo = true;
          }

          if (AUDIO_TYPES.has(streamType)) {
              hasAudio = true;
          }

          pos += 5 + esInfoLength;
      }

      return {
          hasAudio,
          hasVideo
      };
  }

  // Main processing
  const pmtPid = findPMTPid(stream);

  if (pmtPid === null) {
      throw new Error("No PAT found");
  }

  // Get the actual PMT....
  const pmt = findPMT(stream, pmtPid);

  if (!pmt) {
      throw new Error("No PMT found");
  }

  return parsePMT(pmt);
}

//##############################################################################################################//

export const validateVideoFile = async (file:File):Promise<boolean> => {
  const fileExtension = file.name.split(".").pop().toLowerCase();
  console.debug("Validating video file with extension:", fileExtension);

  const videoOption = videoFileOptions.find((option) => option.ext === fileExtension);
  console.debug("Video option found for validation:", videoOption);
  console.debug("Extension:  ", fileExtension);

  if (videoOption) {

    if (fileExtension == "ts") {
      console.log(`About to process ${file}`);
      const {hasVideo, hasAudio} = await detectTsType(await fileToBuffer(file));

      console.log("Video: ", hasVideo);
      console.log("Audio: ", hasAudio);

      return ( hasVideo);
    } else {
        // If this is not a ts file then check if it might be a video file in some other format.
        const isValid = await verifyMagicNumber(file, videoOption.magic);
        console.debug("Video file validation result:", isValid);
        return isValid;   
    }

    return false;
  }

  console.warn("No matching video file option found for extension:", fileExtension);
  return false;
};

export const validateAudioFile = async (file:File):Promise<boolean> => {
  const fileExtension = file.name.split(".").pop().toLowerCase();
  console.debug("Validating audio file with extension:", fileExtension);

  const audioOption = audioFileOptions.find((option) => option.ext === fileExtension);
  console.debug("Audio option found for validation:", audioOption);
  let isValid = false;

  if (audioOption) {

    if (fileExtension == "ts") {
        const {hasVideo, hasAudio} = await detectTsType(await fileToBuffer(file));

        console.log("Video: ", hasVideo);
        console.log("Audio: ", hasAudio);

        return (hasAudio);
    } else {
        // If this is not a ts file then check to see if it is some other sort of audio file.
        isValid = await verifyMagicNumber(file, audioOption.magic);
        console.debug("Audio file validation result:", isValid);   
    }
    return isValid;
  }

  console.warn("No matching audio file option found for extension:", fileExtension);
  return false;
};

// Utility function to verify the magic number of a file against an expected magic number.
export const verifyMagicNumber = async (
    file: File,
    expectedMagic: number[]
): Promise<boolean> => {
    const data = await fileToBuffer(file);
    return expectedMagic.every(
        (byte, index) => data[index] === byte
    );
};

// We need to read the file into a buffer
export async function fileToBuffer(file: File, length?: number): Promise<Uint8Array> {
  const buffer = length ? file.slice(0, length) : file;
  return new Uint8Array(await buffer.arrayBuffer());
}

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

export const createMaster = (videoManifests:Manifest[], audioManifest:Manifest[]) => {
  // create a master manifest using the provided list
  if (videoManifests.length !== 0) {
    console.debug('Manifests: ', videoManifests[0]);    
  } else {
    console.debug('No video manifests provided.');
  }

  if (audioManifest.length !== 0) {
    console.debug('Manifests: ', audioManifest[0]);
  } else {
    console.debug('No audio manifests provided.');
  }

  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:1"
  ];

  for (const video of videoManifests) {
    lines.push(
      '#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1920x1280,CODECS="mp4a.40.2,avc1.100.40",FRAME-RATE=24',
      video.file.webkitRelativePath
    );
    for (const audio of audioManifest) {
      lines.push(
        '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Audio",DEFAULT=YES,AUTOSELECT=YES,URI="' + audio.file.webkitRelativePath + '"'
      );
    }
  }

  return lines.join("\n");
};