// FIRST, before App pulls in the Supabase client: supabase-js copies the global
// fetch when lib/supabase.ts runs, and this wraps it to report failed queries.
import "./lib/supabase-fetch-watch";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "@/components/ErrorBoundary";
import { installGlobalErrorHandlers } from "@/lib/clientErrors";
import { bootErrorReporting } from "@/lib/sentry-boot";
import "./index.css";

installGlobalErrorHandlers();
// Listeners first, so a throw during render is held for Sentry; the SDK itself
// arrives after load.
bootErrorReporting();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary fullPage>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);

// Analytics after the first render, at once, before a redirect (/ to /home or
// /auth) drops the utm tags. No key at build time, no PostHog chunk at all.
if (import.meta.env.VITE_POSTHOG_KEY) {
  void import("./lib/posthog").then((m) => m.initPostHog()).catch(() => {});
}
