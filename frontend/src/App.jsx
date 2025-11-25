import {
  OIDC_AUTHORITY,
  OIDC_CLIENT_ID,
  OIDC_REDIRECT_URI,
  OIDC_SCOPES,
  AWS_IDENTITY_POOL_ID,
  IS_HLS_DEPLOYED,
  IS_HLS_INGEST_DEPLOYED,
  IS_FFMPEG_DEPLOYED,
} from "@/constants";
import { HashRouter, Route, Routes } from "react-router-dom";

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
import { AuthProvider } from "react-oidc-context";
import AuthGuard from "@/components/AuthGuard";

const oidcConfig = {
  authority: `https://${OIDC_AUTHORITY}`,
  client_id: OIDC_CLIENT_ID,
  redirect_uri: OIDC_REDIRECT_URI,
  post_logout_redirect_uri: OIDC_REDIRECT_URI,
  response_type: "code",
  scope: OIDC_SCOPES.join(" "),
  revokeTokenTypes: ["refresh_token"],
  revokeTokensOnSignout: true,

  onSigninCallback: () => {
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};

const App = () => {
  return (
    <AuthProvider {...oidcConfig}>
      <AuthGuard>
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
              <Route path="player/:type/:id" element={<OmakaseHlsPlayer />} />
              {AWS_IDENTITY_POOL_ID && (
                <>
                  {IS_HLS_DEPLOYED && (
                    <Route path="hlsplayer/:type/:id" element={<HlsPlayer />} />
                  )}
                  {IS_HLS_INGEST_DEPLOYED && (
                    <>
                      <Route path="workflows" element={<HlsIngestion />} />
                      <Route
                        path="hls-channels"
                        element={<MediaLiveHlsIngestion />}
                      />
                      <Route
                        path="hls-jobs"
                        element={<MediaConvertHlsIngestion />}
                      />
                    </>
                  )}
                  {IS_FFMPEG_DEPLOYED && (
                    <>
                      <Route
                        path="ffmpeg-exports"
                        element={<FfmpegExports />}
                      />
                      <Route path="ffmpeg-rules" element={<FfmpegRules />} />
                      <Route path="ffmpeg-jobs" element={<FfmpegJobs />} />
                    </>
                  )}
                  <Route path="mediaconvert-tams-jobs">
                    <Route index element={<MediaConvertTamsJobs />} />
                  </Route>
                </>
              )}
            </Route>
          </Routes>
        </HashRouter>
      </AuthGuard>
    </AuthProvider>
  );
};

export default App;
