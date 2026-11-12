// The studio's theme: light unless this device chose dark or System (Leo, 13 Nov: "let it be light by default")
// (which follows the device's own setting, live). Public pages (link in bio, review links, reports, sign-in, Send to
// phone) stay light: index.html's first-paint script and StudioLayout only darken the studio. Per device, outside the
// sync prefix, like the open profile.
const KEY = "cs-theme";
export type Theme = "dark" | "light";
export type ThemePick = Theme | "system";
export type ThemeOutlet = { theme: ThemePick; onTheme: (t: ThemePick) => void };

/** Paths drawn outside the studio shell (App.tsx); index.html keeps the same list for the first paint. */
export const PUBLIC_PATH = /^\/(roadmap|auth|review|l|join|t|phone)(\/|$)/;

/** This device's pick: light when it never chose (or storage is blocked). */
export function readTheme(): ThemePick {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "system" ? v : "light";
  } catch {
    return "light";
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
