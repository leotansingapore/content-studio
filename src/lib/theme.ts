// The studio's theme, after Fastlane (docs/fastlane-nav-gap.md): dark unless this device chose light. Public pages
// (link in bio, review links, reports, sign-in) stay light: index.html's first-paint script and StudioLayout only
// darken the studio. Per device, outside the sync prefix, like the open profile.
const KEY = "cs-theme";
export type Theme = "dark" | "light";

/** Paths drawn outside the studio shell (App.tsx); index.html keeps the same list for the first paint. */
export const PUBLIC_PATH = /^\/(roadmap|auth|review|l|join|t)(\/|$)/;

export function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(t: Theme | null) {
  document.documentElement.classList.toggle("dark", t === "dark");
}

export function saveTheme(t: Theme) {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // a blocked store still switches this page
  }
  applyTheme(t);
}
