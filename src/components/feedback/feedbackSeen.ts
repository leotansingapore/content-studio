// Whether the board has been opened in this browser, apart from the board itself so the sidebar's New tag doesn't
// bring the whole board (~60 KB) into the main bundle.
export function feedbackSeenKey(boardKey: string) {
  return `fb_seen_${boardKey.slice(-8)}`;
}

/** True until the person has opened the page once in this browser. */
export function isFeedbackNew(boardKey: string): boolean {
  try {
    return typeof window !== "undefined" && !localStorage.getItem(feedbackSeenKey(boardKey));
  } catch {
    return false;
  }
}
