import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import crypto from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// dist/version.json carries the id of the build that produced it, so a deploy
// can be confirmed from outside without trusting the host's own status.
function versionJsonPlugin(buildId: string): Plugin {
  return {
    name: "version-json",
    apply: "build",
    writeBundle({ dir }) {
      const outDir = dir || "dist";
      mkdirSync(outDir, { recursive: true });
      writeFileSync(path.join(outDir, "version.json"), JSON.stringify({ buildId }));
    },
  };
}

// Uploading source maps needs a token that only exists in CI, so local and
// preview builds simply skip the step instead of failing.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
// One id per build, shared by version.json, the __APP_BUILD_ID__ the Sentry SDK
// reports as its release, and the release the source maps upload against. If
// these drift, Sentry has the maps but cannot match them to an event.
const buildId = crypto.randomUUID();

export default defineConfig({
  plugins: [
    react(),
    versionJsonPlugin(buildId),
    // Last: it reads the finished bundle and its maps.
    ...(sentryAuthToken
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG || "leo-tf",
            project: process.env.SENTRY_PROJECT || "",
            authToken: sentryAuthToken,
            // Off by default it would report build metrics to Sentry; nothing
            // here needs that, and it is data leaving the build for no return.
            telemetry: false,
            release: { name: buildId },
            sourcemaps: {
              // Uploaded, then removed from dist. Serving them would publish
              // the whole readable source to anyone who looks.
              filesToDeleteAfterUpload: ["./dist/**/*.js.map"],
            },
          }),
        ]
      : []),
  ],
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "::",
    port: 5173,
  },
  build: {
    target: "es2020",
    // Hidden: emitted for the upload, never referenced from the bundle.
    sourcemap: sentryAuthToken ? "hidden" : false,
  },
});
