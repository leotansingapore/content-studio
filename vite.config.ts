import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// The reels board API lives on MoneyBees Studio; vercel.json proxies it in
// production, this does the same for dev and preview.
const MB_STUDIO = {
  target: "https://moneybees-studio.vercel.app",
  changeOrigin: true,
  rewrite: (p: string) => p.replace(/^\/mb-studio/, ""),
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "::",
    port: 5173,
    proxy: { "/mb-studio": MB_STUDIO },
  },
  preview: {
    proxy: { "/mb-studio": MB_STUDIO },
  },
  build: {
    target: "es2020",
  },
});
