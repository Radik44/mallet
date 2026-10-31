import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Repository root, so the dev server can serve corpus maps through `/@fs/`. */
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

// Set by `tauri dev` when running against a device or remote host.
const host = process.env.TAURI_DEV_HOST;

/** The app version from the Tauri config, shown on the boot banner. */
const version = (JSON.parse(readFileSync(new URL("./src-tauri/tauri.conf.json", import.meta.url), "utf8")) as { version: string }).version;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
    fs: { allow: [repoRoot] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    // WebView2 on Windows 11 is a current Chromium; no legacy targets.
    target: "chrome120",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
