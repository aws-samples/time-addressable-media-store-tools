import { useState } from "react";
import {
  Button,
  Checkbox,
  Modal,
  SpaceBetween,
  TextContent,
} from "@cloudscape-design/components";

import ProgressBar from "@cloudscape-design/components/progress-bar";
import { AWS_S3_CONTENT_BUCKET } from "@/constants";
import useS3Api from "@/hooks/useS3Api";
import useAlertsStore from "@/stores/useAlertsStore";
import { Upload } from "@aws-sdk/lib-storage";

import {
  Manifest,
  Segment,
  validateManifestFile,
  ManifestList,
  MediaType,
  PackageType,
  validateVideoFile,
  validateAudioFile,
  isMasterManifest,
  findMaster,
  createMaster,
  ManifestResult,
} from "@/utils/manifest";

import CancelModalFooter from "./CancelModalFooter";

// These are the properties for the local ingest modal. They are actual callbacks.
type Props = {
  localModalVisible: boolean;
  onComplete: (result: ManifestResult) => void;
  onCancel: () => void;
};

// Local ingest handler function.
const LocalIngestHandler = ({
  localModalVisible,
  onComplete,
  onCancel,
}: Props) => {

  const [manifestList, setManifestList] = useState<ManifestList>({
    video: [],
    audio: [],
  });

  const [masterM3U8, setMasterM3U8] = useState<string>("");

  const [fileList, setFileList] = useState<Map<string, Segment>[]>([]);
  const [packageType, setPackageType] = useState<PackageType>("HLS");

  // We need a master manifest, track it here.
  const [errorMessage, setErrorMessage] = useState("");

  // Create some alert messagees when problem hit!
  const addAlertItem = useAlertsStore((s) => s.addAlertItem);
  const delAlertItem = useAlertsStore((s) => s.delAlertItem);

  // Display a progress bar whilst processing the assets to see what they are...
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // DIfferent progress bar for the upload to S3.
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState("");

  // Flags to tell us whether the user has selected video or audio assets to upload.
  const [videoSelected, setVideoOption] = useState(true);
  const [audioSelected, setAudioOption] = useState(false);

  // We will upload all the files to S3, including the manifest(s). Once there we can trigger processing using lambda.
  const { getS3Client } = useS3Api();

  const processFiles = async() => {

    let masterm3u8 = masterM3U8;

    console.debug(`Processing files with manifest list: ${JSON.stringify(manifestList)}`);
    console.debug(`MasterM3U8: ${masterm3u8}`);

    //If we found no manifests there is nothing to do.....
    //if (!masterM3U8 || manifestList["video"].length === 0 && manifestList["audio"].length === 0) return;

    // We now do the upload to S3 for all the data. First we need a jobID...
    const jobId = `local-${crypto.randomUUID()}-${Date.now()}`;
  
    // Step 1: flatten all uploadable files
    const files = Array.from(fileList.flatMap((map) => Array.from(map.values())));

    console.debug('File list is:  ', files);

    // Now, find out if there are master manifests in the folders, make a list if so. If not create a master.
    console.debug(`Finding master manifest in uploaded files...`, manifestList);

    // We might be ingesting both video and audio....
    const combinedManifests = manifestList["video"].concat(manifestList["audio"]);
    console.debug(`Combined manifest list: ${JSON.stringify(combinedManifests)}`);

    // If we already have a master manifest, use that, otherwise find one in the uploaded files or create one.
    const masterList = await findMaster(combinedManifests);

    if (masterList.length === 0 && masterm3u8) {
      // If there is no master manifest found, add the one from the localData to the list. If it exists!
      masterList.push(masterm3u8);
    };

    if (!masterm3u8 && masterList.length > 0) {
      masterm3u8 = masterList[0];
      console.debug(`No master manifest set, using first found: ${masterm3u8}`);
    }; 

    console.debug("MasterM3U8 is: ", masterm3u8);

    // Get an S3 client to use for upload.
    const s3Client = await getS3Client();  
    console.debug(`Initialized S3 client. ${s3Client}`);

    // if there is still no master manifest, create one from the manifests we have.
    if (masterList.length === 0) {
      console.debug("No master manifest found, creating...");
      const madeManifest = createMaster(manifestList["video"], manifestList["audio"]);
      const manifestKey = `${jobId}/master.m3u8`;

      console.debug('Master manifest content:  ', madeManifest);
        
      // Upload the master.
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: AWS_S3_CONTENT_BUCKET,
          Key: manifestKey,
          Body: madeManifest,
        }
      });

      upload.done();

      const manifestUrl = `s3://${AWS_S3_CONTENT_BUCKET}/${manifestKey}`;
      masterm3u8 = manifestUrl;
      console.debug(`Created master manifest: ${manifestUrl}`);
      console.debug(`Master manifest content:  ${masterm3u8}`);
      masterList.push(manifestUrl);
    } else {
        console.debug(`Master manifest(s) found: ${masterList.join(", ")}`);
    }  

    console.debug(`Master manifest list: ${JSON.stringify(masterList)}`);
    
    if (masterList.length > 1) {
      console.warn("Multiple master manifests found. This is not currently supported. Please ensure only one master manifest is included in the upload.");
      addAlertItem({
        type: "warning",
        dismissible: true,
        content: "Multiple master manifests found. This is not currently supported. Please ensure only one master manifest is included in the upload.",
        id: jobId,
        onDismiss: () => delAlertItem(jobId),
      });
      return;
    }

    console.debug(`Using master manifest: ${masterList[0]}`);
    
    // Now upload all the files to S3.
    const isHLS = files.some(f => f.type === "manifest" && packageType === "HLS" );
    const isDASH = files.some(f => f.type === "manifest" && packageType === "DASH" );

    console.debug(`Detected manifest types - HLS: ${isHLS}, DASH: ${isDASH}`);

    const totalBytes = files.reduce((sum, fileInfo) => sum + fileInfo.file.size,0);
    let uploadedBytes = 0;
    
    console.debug(`Total bytes to upload: ${totalBytes}`);
    console.debug(`Total files to upload: ${files.length}`);
    console.debug(`Job ID: ${jobId}`);
    console.debug(`Master manifest: ${masterList[0]}`);
    console.debug(`MasterM3U8: ${masterm3u8}`);
    console.debug(`Package type: ${packageType}`);
    console.debug(`Manifest list: ${JSON.stringify(manifestList)}`);
    console.debug(`Uploaded files: ${JSON.stringify(Array.from(fileList.flatMap((map) => Array.from(map.values()))).map((f) => f.name))}`);

    const uploads = files.map(async (fileInfo) => {
      const file = fileInfo.file;

      const key = `${jobId}/${file.webkitRelativePath || file.name}`;

      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: AWS_S3_CONTENT_BUCKET,
          Key: key,
          Body: file,
        },
      });    

      // Track how many bytes have been uploaded across all files to provide overall progress feedback.
      let previousLoaded = 0;
      setIsUploading(true);

      upload.on("httpUploadProgress", (progress) => {
        const currentLoaded = progress.loaded || 0;
        uploadedBytes += currentLoaded - previousLoaded;
        previousLoaded = currentLoaded;

        setCurrentFile(file.name);

        const percent = (Math.round((uploadedBytes / totalBytes) * 100));
        setUploadProgress(percent);

      });
      return upload.done();
    });

    try {
      await Promise.all(uploads);
      console.debug("All files uploaded successfully.");
      setIsUploading(false);
    } catch (error) {
      console.error("Error uploading files:", error);
      addAlertItem({
        type: "error",
        dismissible: true,
        content: "Error uploading files to S3.",
        id: jobId,
        onDismiss: () => delAlertItem(jobId),
      });
    }

    if (masterList.length > 1) {
      console.warn("Multiple master manifests found. This is not currently supported. Please ensure only one master manifest is included in the upload.");
      addAlertItem({
        type: "warning",
        dismissible: true,
        content: "Multiple master manifests found. This is not currently supported. Please ensure only one master manifest is included in the upload.",
        id: jobId,
        onDismiss: () => delAlertItem(jobId),
      });
    };

    const result = {
      packageType,
      masterManifest: masterm3u8,
    };

    // Set the master manifest in state for display.
    setMasterM3U8(masterm3u8);

    console.debug(`Manifest result: ${JSON.stringify(result)}`);
    onComplete(result);    
  };

  const handleDismiss = () => {
    onCancel();
  }

  console.log("The list of manifests: ", manifestList);

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>, mediaType:MediaType = "video") => {
    const files = e.target.files;
    const fileMap = new Map<string, Segment>();
    const allManifests: Manifest[] = [];

    let packageType:PackageType = "HLS";
    let validVideo = false;
    let validAudio = false;

    console.log("Selected files: ", files);
    console.log("Media type: ", mediaType);

    if (!files) return;

    // Initialise the progress bar.
    setIsProcessing(true);
    setProgress(0);

    const total = files.length;
    let filecount = 0;

    for (const file of files) {
      console.log("Processing file:", file);
      if (!file) continue;

      // Need to count the number of files to get the progress %
      filecount++;

      const relativePath = file.webkitRelativePath || file.name;
      const fileExtension = file.name ? file.name.split(".").pop().toLowerCase() : undefined;
      
      if (fileExtension && (fileExtension === "m3u8" || fileExtension === "mpd")) {
        // Validate the manifest file to ensure it is a valid HLS or DASH manifest.
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
          console.debug(`Master manifest found: ${file.name}`);
        };

        console.log("Manifest added....", JSON.stringify(file.name));

        // Set the package type.
        packageType = file.name.endsWith(".m3u8") ? "HLS" : "DASH";

        // We also need to keep a list of the files we found, but we add the manifests to the file map too....
        fileMap.set(relativePath, new Segment(file, file.name, fileExtension, "manifest"));
        continue;
      } else if (!fileExtension) {
        return setErrorMessage(`File with no extension found: ${file.name}. Please select a folder containing only valid HLS or DASH manifests.`);
      };

      if (packageType !== "HLS") {
        return setErrorMessage(`Non HLS file found: ${file.name}. Please select a folder containing only valid HLS manifests.`);
      };

      switch (mediaType) {
        case "video":
              if (await validateVideoFile(file)){
                fileMap.set(relativePath, new Segment(file, file.name, fileExtension, "video"));
                // Display a progress bar to show how many files have been processed.
                setProgress(Math.round(((filecount + 1)/ total) * 100))
                validVideo = true;
                console.log("Video File Count:", filecount);                               
              };
              break;
        case "audio":
              if (await validateAudioFile(file)) {
                fileMap.set(relativePath, new Segment(file, file.name, fileExtension, "audio"));
                // Display a progress bar to show how many files have been processed.
                setProgress(Math.round(((filecount + 1)/ total) * 100))
                validAudio = true;
                console.log("Audio File Count: ", filecount);
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

    setFileList(prev => [...prev, fileMap]);
    setPackageType(packageType);
  };

  console.debug("End Manifest list is: ", manifestList);
  console.debug("End File list is: ", fileList);
  console.debug("End Package type is: ", packageType);

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
          <Checkbox
            checked={ videoSelected }
            onChange={(event) => setVideoOption(event.detail.checked )}
          >
            Video Assets
          </Checkbox>
          <Checkbox
            checked={ audioSelected }
            onChange={(event) => setAudioOption(event.detail.checked )}
          >
            Audio Assets
          </Checkbox>

          {/* hidden file input */}
          { videoSelected && (
            <>
            <input
              id="videoFileInput"
              type="file"
              hidden
              multiple
            {...{webkitdirectory: "true"}}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFolderSelect(e, "video")}
          />

            <Button onClick={() => document.getElementById("videoFileInput")?.click()}>
              Select Folder containing Video Manifest
            </Button> 
          </>         
          )}

          {audioSelected && (
            <>
            <input
              id="audioFileInput"
              type="file"
              hidden
              multiple
            {...{webkitdirectory: "true"}}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFolderSelect(e, "audio")}
          />

            <Button onClick={() => document.getElementById("audioFileInput")?.click()}>
              Select Folder containing Audio Manifest
            </Button>
          </>
          )}


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
            {videoSelected && (
              <TextContent>
                  Selected Video Manifest: &nbsp;&nbsp;&nbsp; {manifestList.video[0].name || "None"}
              </TextContent>
            )}

            {audioSelected && (
                <TextContent>
                  Selected Audio Manifest: &nbsp;&nbsp;&nbsp; {manifestList.audio[0]?.name || "None"}
                </TextContent>         
            )}
          </>
          ))
        }

        {isProcessing && (
          <>
          <div style={{ marginTop: "1rem" }}>
            <span style={{ fontStyle: "italic", color: "gray" }}>
              Currently Scanning: {currentFile}
            </span>
          </div>

          <ProgressBar
            value={progress}
            label="Scanning files..."
            description={`${progress}% complete`}
          />
          </>
        )}

        {isUploading && (
          <>
            <div style={{ marginTop: "1rem" }}>
              <span style={{ fontStyle: "italic", color: "gray" }}>
                  Currently Uploading: {currentFile}
              </span>
            </div>
            
            <ProgressBar
              value={uploadProgress}
              label={`Uploading package (${uploadProgress}%)`}
              description={`${uploadProgress}% complete`}
            />           
          </>
        )}
        </SpaceBetween>
      </Modal>
    </>
  );
};

export default LocalIngestHandler;