// "New version ready: Later / Refresh" (Fastlane's sidebar notice). A tab left open across a deploy keeps running the
// old build until a lazy chunk goes missing (clientErrors.ts reloads then). This says so first: each time the tab comes
// back, and every 15 minutes, it reads index.html and compares the build's hash with the one running. Later hides it
// for this tab until a newer build still. Dev builds have no hash, so nothing is asked.
import { useEffect, useState } from "react";

const LATER_KEY = "cs-version-later"; // sessionStorage: this tab only
const EVERY_MS = 15 * 60_000;

/** The build hash an index.html (or a script src) names. */
export const releaseIn = (html: string): string | null => html.match(/\/assets\/index-([\w-]+)\.js/)?.[1] ?? null;

/** The live build's hash when it differs from the running one and Later was not pressed on it; else null. */
export function newerRelease(running: string | null, html: string, later: string | null = null): string | null {
  const live = releaseIn(html);
  return running && live && live !== running && live !== later ? live : null;
}

const read = (k: string) => {
  try {
    return window.sessionStorage.getItem(k);
  } catch {
    return null;
  }
};

/** The newer build's hash once one is live, and Later. */
export function useNewVersion(): { ready: string | null; later: () => void } {
  const [ready, setReady] = useState<string | null>(null);
  useEffect(() => {
    // shortcut: the shell's tests run effects against a stand-in document with no querySelector; nothing to compare there
    if (typeof document.querySelector !== "function") return;
    const running = releaseIn(document.querySelector<HTMLScriptElement>('script[src*="/assets/index-"]')?.src ?? "");
    if (!running) return;
    let live = true;
    let last = 0;
    const check = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 60_000) return;
      last = Date.now();
      fetch("/index.html", { cache: "no-store" })
        .then((r) => (r.ok ? r.text() : ""))
        .then((html) => live && setReady(newerRelease(running, html, read(LATER_KEY))))
        .catch(() => {}); // offline: ask again next time
    };
    const timer = window.setInterval(check, EVERY_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return {
    ready,
    later: () => {
      try {
        if (ready) window.sessionStorage.setItem(LATER_KEY, ready);
      } catch {
        // storage blocked: it hides for this page view
      }
      setReady(null);
    },
  };
}
