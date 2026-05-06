import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  base: "./",
  define: {
    global: "globalThis", //<-- AWS SDK
  },
  optimizeDeps: {},
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
      // this is required for Amplify
      {
        find: "./runtimeConfig",
        replacement: "./runtimeConfig.browser", // ensures browser compatible version of AWS JS SDK is used
      },
    ],
  },
  preview: {
    allowedHosts: true,
  },
  server: {
    allowedHosts: true,
  },
});
