import { ChangeEvent, useState } from "react";
import {
  Button,
  FormField,
  Input,
  Checkbox,
  Modal,
  SpaceBetween,
  TextContent,
} from "@cloudscape-design/components";

import ProgressBar from "@cloudscape-design/components/progress-bar";
import { AWS_S3_CONTENT_BUCKET } from "@/constants";
import useS3Api from "@/hooks/useS3Api";
import { Upload } from "@aws-sdk/lib-storage";

import {
  Manifest,
  Segment,
  validateManifestFile,
  LocalIngestResult,
  ManifestList,
  MediaType,
  PackageType,
  validateVideoFile,
  validateAudioFile,
  isMasterManifest,
} from "@/utils/manifest";

import CancelModalFooter from "./CancelModalFooter";

// These are the properties for the local ingest modal. They are actual callbacks.
type Props = {
  localModalVisible: boolean;
  onComplete: (result: LocalIngestResult) => void;
  onCancel: () => void;
};


// Local ingest handler function.
const LocalIngestHandler = ({
  localModalVisible,
  onComplete,
  onCancel,
}: Props) => {

  //const [includeAudio, setIncludeAudio] = useState(false);

  const [manifestList, setManifestList] = useState<ManifestList>({
    video: [],
    audio: [],
  });

  const [localData, setLocalData] = useState<LocalIngestResult>();
  const [masterM3U8, setMasterM3U8] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Display a progress bar whilst processing the assets to see what they are...
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const processFiles = async() => {

    if (!localData) return;

    // set the masterManifest to that for the video.
    //setLocalData(masterManifest:masterM3U8);

    onComplete(localData);    

  };

  const handleDismiss = () => {
    onCancel();
  }

  console.log("The list of manifests: ", manifestList);
  console.log("The type of the manifest is:", manifestList.video[0] instanceof Manifest);
  console.log(`LocalData:  ${JSON.stringify(localData)}`);

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>, mediaType:MediaType = "video") => {
    const files = e.target.files;
    const fileMap = new Map<string, Segment>();
    const allManifests: Manifest[] = [];

    let packageType:PackageType;
    let validVideo = false;
    let validAudio = false;

    if (!files) return;

    // Initialise the progress bar.
    setIsProcessing(true);
    setProgress(0);

    const total = files.length;
    let filecount = 0;

    for (const file of files) {
      console.debug(file);
      if (!file) continue;

      // Need to count the number of files to get the progress %
      filecount++;

      const relativePath = file.webkitRelativePath || file.name;
      const fileExtension = file.name.split(".").pop().toLowerCase();
      
      if (file.name.endsWith(".m3u8") || file.name.endsWith(".mpd")) {
        const isValidManifest = await validateManifestFile(file);
        // If the manifest is not valid skip to next file.
        if (!isValidManifest) continue;
        // Now we build a list of manifests.
        // We might have the following:
        //  1. master manifest and variant manifests.
        //  2. single media manifest.

          // Build a list which we add to the appropriate list later.
        allManifests.push(new Manifest(file, file.name, fileExtension) );
        if (isMasterManifest(file.name)) {
          setMasterM3U8(file.name);
        };

        console.log("Manifest added....", JSON.stringify(file.name));

        // Set the package type.
        packageType = file.name.endsWith(".m3u8") ? "HLS" : "DASH";

        // We also need to keep a list of the files we found, but we add the manifests to the file map too....
        fileMap.set(relativePath, new Segment(file, file.name, fileExtension, "manifest"));
        continue;
      };

      switch (mediaType) {
        case "video":
              if (await validateVideoFile(file)){
                fileMap.set(relativePath, new Segment(file, file.name, fileExtension, "video"));
                setProgress(Math.round(((filecount + 1)/ total) * 100))
                validVideo = true;
                console.log("Video Count:", validVideo);                               
              };
              break;
        case "audio":
              if (await validateAudioFile(file)) {
                fileMap.set(relativePath, new Segment(file, file.name, fileExtension, "audio"));
                setProgress(Math.round(((filecount + 1)/ total) * 100))
                validAudio = true;
                console.log("Audio Count: ", validAudio);
              };
              break;
        default:
            console.log("Unknown media type");
      };
    };
    
    setIsProcessing(false);
    console.log(`Add to ${mediaType} Manifest: ${JSON.stringify(allManifests)}`);
    console.log(`Validity flags are: Video: ${validVideo} and Audio: ${validAudio}`);

    switch (mediaType) {
      case "video":
        if (!validVideo) {
          setErrorMessage("Non Video assets found");
        };
        break;
      case "audio":
        if (!validAudio) {
          setErrorMessage("Non Audio assets found");
        };
        break;
    }

    setManifestList(prev => ({
      ...prev,
      [mediaType]: [
        ...prev[mediaType],
        ...allManifests,
      ],
    }));    

    setLocalData((prev => ({
      ...(prev ?? {}),
      masterManifest: masterM3U8,
      manifestList: manifestList,
      uploadedFiles: new Map(fileMap),
      packageType: packageType,
    })));
    
  };

  return (
    <>
      <Modal
        visible={localModalVisible}
        onDismiss={handleDismiss}
        footer = {<CancelModalFooter
            onCancel={handleDismiss}
            onSubmit={processFiles}
            submitText="Yes"
            />
          }
        header="Local Confirmation"
      >
        <SpaceBetween size="xs">
          {/* hidden file input */}
          <input
            id="videoFileInput"
            type="file"
            hidden
            multiple
            {...{webkitdirectory: "true"}}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFolderSelect(e, "video")}
          />

          <input id="audioFileInput"
            type="file"
            hidden
            multiple
            {...{webkitdirectory: "true"}}
            onChange={(e) => handleFolderSelect(e, "audio")}
          />
          <Button onClick={() => document.getElementById("videoFileInput")?.click()}>
            Select Folder containing Video Manifest
          </Button>

          {errorMessage && (
            <TextContent>
              {errorMessage}
            </TextContent>
          )}

          {masterM3U8 ? (
            <>
              <TextContent>
                Selected Master Manifest: &nbsp;&nbsp;&nbsp; {masterM3U8}
              </TextContent>
            </>
          ): (
            manifestList?.video?.length > 0 && (
            <>
              <TextContent>
                  Selected Video Manifest: &nbsp;&nbsp;&nbsp; {manifestList.video[0].name}
              </TextContent>
            |</>          
            )
          )
        }

        {isProcessing && (
          <ProgressBar
            value={progress}
            label="Scanning files..."
            description={`${progress}% complete`}
          />
        )}        
       
        </SpaceBetween>
      </Modal>
    </>
  );
};

export default LocalIngestHandler;