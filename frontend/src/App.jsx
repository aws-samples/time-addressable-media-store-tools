import {
  AWS_HLS_OBJECT_LAMBDA_ACCESS_POINT_ARN,
  AWS_HLS_INGEST_ENDPOINT,
  AWS_IDENTITY_POOL_ID,
  AWS_FFMPEG_ENDPOINT,
  AWS_REGION,
  AWS_TAMS_ENDPOINT,
  AWS_USER_POOL_CLIENT_WEB_ID,
  AWS_USER_POOL_ID,
} from "@/constants";
import { HashRouter, Route, Routes } from "react-router-dom";

import { Amplify } from "aws-amplify";
import { ConsoleLogger } from "aws-amplify/utils";
import Diagram from "@/views/Diagram";
import Flow from "@/views/Flow";
import Flows from "@/views/Flows";
import HlsPlayer from "@/views/HlsPlayer";
import { OmakaseHlsPlayer } from "@/views/OmakasePlayer";
import Home from "@/views/Home";
import Layout from "@/views/Layout";
import HlsIngestion from "@/views/HlsIngestion";
import FfmpegExports from "@/views/FfmpegExports";
import FfmpegRules from "@/views/FfmpegRules";
import FfmpegJobs from "@/views/FfmpegJobs";
import MediaConvertHlsIngestion from "@/views/MediaConvertHlsIngestion";
import MediaConvertTamsJobs from "@/views/MediaConvertTamsJobs";
import MediaLiveHlsIngestion from "@/views/MediaLiveHlsIngestion";
import React from "react";
import Source from "@/views/Source";
import Sources from "@/views/Sources";
import { withAuthenticator } from "@aws-amplify/ui-react";

ConsoleLogger.LOG_LEVEL = "INFO";
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: AWS_USER_POOL_ID,
      userPoolClientId: AWS_USER_POOL_CLIENT_WEB_ID,
      identityPoolId: AWS_IDENTITY_POOL_ID,
    },
  },
  API: {
    REST: {
      TAMS: {
        endpoint: AWS_TAMS_ENDPOINT,
        region: AWS_REGION,
      },
      HlsIngest: {
        endpoint: AWS_HLS_INGEST_ENDPOINT,
        region: AWS_REGION,
      },
      Ffmpeg: {
        endpoint: AWS_FFMPEG_ENDPOINT,
        region: AWS_REGION,
      },
    },
  },
});

const App = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="sources">
            <Route index element={<Sources />} />
            <Route path=":sourceId" element={<Source />} />
          </Route>
          <Route path="flows">
            <Route index element={<Flows />} />
            <Route path=":flowId" element={<Flow />} />
          </Route>
          <Route path="diagram/:type/:id" element={<Diagram />} />
          {AWS_HLS_OBJECT_LAMBDA_ACCESS_POINT_ARN && (
            <Route path="hlsplayer/:type/:id" element={<HlsPlayer />} />
          )}
          <Route path="player/:type/:id" element={<OmakaseHlsPlayer />} />
          {AWS_HLS_INGEST_ENDPOINT && (
            <>
              <Route path="workflows" element={<HlsIngestion />} />
              <Route path="hls-channels" element={<MediaLiveHlsIngestion />} />
              <Route path="hls-jobs" element={<MediaConvertHlsIngestion />} />
            </>
          )}
          {AWS_FFMPEG_ENDPOINT && (
            <>
              <Route path="ffmpeg-exports" element={<FfmpegExports />} />
              <Route path="ffmpeg-rules" element={<FfmpegRules />} />
              <Route path="ffmpeg-jobs" element={<FfmpegJobs />} />
            </>
          )}
          <Route path="mediaconvert-tams-jobs">
            <Route index element={<MediaConvertTamsJobs />} />
          </Route>
        </Route>
      </Routes>
    </HashRouter>
  );
};

const AuthApp = withAuthenticator(App, { hideSignUp: true });

export default AuthApp;
