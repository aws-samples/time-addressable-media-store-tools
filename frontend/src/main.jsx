import "@cloudscape-design/global-styles/index.css";
import "@aws-amplify/ui-react/styles.css";
import "video.js/dist/video-js.css";

import App from "@/App";
import React from "react";
import ReactDOM from "react-dom/client";

/**
 * StrictMode renders components twice in development mode. Disabling to avoid double useEffect() executions while mounting player
 *
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
*/
ReactDOM.createRoot(document.getElementById("root")).render(<App />);