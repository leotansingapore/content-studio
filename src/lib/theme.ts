// The studio's theme, after Fastlane (docs/fastlane-nav-gap.md): dark unless this device chose light or System
// (which follows the device's own setting, live). Public pages (link in bio, review links, reports, sign-in, Send to
// phone) stay light: index.html's first-paint script and StudioLayout only darken the studio. Per device, outside the
// sync prefix, like the open profile.
const KEY = "cs-theme";
export type Theme = "dark" | "light";
export type ThemePick = Theme | "system";

/** Paths drawn outside the studio shell (App.tsx); index.html keeps the same list for the first paint. */
export const PUBLIC_PATH = /^\/(roadmap|auth|review|l|join|t|phone)(\/|$)/;

/** This device's pick: dark when it never chose (or storage is blocked). */
export function readTheme(): ThemePick {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
}

/** What a pick draws: System follows the device (osDark: prefers-color-scheme: dark matches). */
export const resolveTheme = (pick: ThemePick, osDark: boolean): Theme => (pick === "system" ? (osDark ? "dark" : "light") : pick);

export function applyTheme(t: Theme | null) {
  document.documentElement.classList.toggle("dark", t === "dark");
}

export function saveTheme(t: ThemePick) {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // a blocked store still switches this page
  }
}
