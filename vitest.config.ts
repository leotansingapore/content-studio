import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The suite assumes the studio's own zone (Singapore, TIMEZONE in autoPost.ts); pin it so CI (UTC) matches a dev machine.
process.env.TZ = "Asia/Singapore";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: { environment: "node" },
});
