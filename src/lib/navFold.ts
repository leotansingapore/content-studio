const KEY = "cs-nav-folded";

export const readFolded = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

export const saveFolded = (folded: boolean) => {
  try {
    if (folded) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    return;
  }
};

export const applyFolded = (folded: boolean) => document.documentElement.toggleAttribute("data-nav-folded", folded);

export const isFoldKey = (e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey">) => (e.metaKey || e.ctrlKey) && !e.altKey && e.key === "\\";

export const foldShortcut = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘\\" : "Ctrl \\";

export const NAV_FOLD_KEY = KEY;
