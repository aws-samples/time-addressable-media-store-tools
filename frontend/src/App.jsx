import {
  AWS_HLS_API_ENDPOINT,
  AWS_HLS_INGEST_ENDPOINT,
  AWS_IDENTITY_POOL_ID,
  AWS_MC_ENDPOINT,
  AWS_ML_ENDPOINT,
  AWS_REGION,
  AWS_TAMS_ENDPOINT,
  AWS_USER_POOL_CLIENT_WEB_ID,
  AWS_USER_POOL_ID,
} from "@/constants";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Mode, applyMode } from "@cloudscape-design/global-styles";

import { Amplify } from "aws-amplify";
import { ConsoleLogger } from "aws-amplify/utils";
import Diagram from "@/views/Diagram";
import Flow from "@/views/Flow";
import Flows from "@/views/Flows";
import HlsPlayer from "@/views/HlsPlayer";
import Home from "@/views/Home";
import Layout from "@/views/Layout";
import HlsIngestion from "@/views/HlsIngestion";
import MediaConvertIngestion from "@/views/MediaConvertIngestion";
import MediaLiveIngestion from "@/views/MediaLiveIngestion";
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
      MediaLive: {
        endpoint: AWS_ML_ENDPOINT,
        region: AWS_REGION,
      },
      MediaConvert: {
        endpoint: AWS_MC_ENDPOINT,
        region: AWS_REGION,
      },
    },
  },
});

applyMode(Mode.Dark);

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
          {AWS_HLS_INGEST_ENDPOINT && (
            <Route path="workflows" element={<HlsIngestion />} />
          )}
          {AWS_ML_ENDPOINT && (
            <Route path="channels" element={<MediaLiveIngestion />} />
          )}
          {AWS_MC_ENDPOINT && (
            <Route path="jobs" element={<MediaConvertIngestion />} />
          )}
        </Route>
        {AWS_HLS_API_ENDPOINT && (
          <Route path="player/:type/:id" element={<HlsPlayer />} />
        )}
      </Routes>
    </HashRouter>
  );
};

const AuthApp = withAuthenticator(App, { hideSignUp: true });

export default AuthApp;
