/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// vite.config.ts: one id per build, shared with dist/version.json and Sentry's release.
declare const __APP_BUILD_ID__: string;
