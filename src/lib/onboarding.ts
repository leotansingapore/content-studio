// Tracks whether a user has seen the first-run welcome, so returning users go
// straight to their dashboard.

const KEY_PREFIX = "content-studio-onboarded-";

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (_) {
    return null;
  }
}

export function isOnboarded(userId: string | null | undefined): boolean {
  if (!userId) return true; // don't gate when we don't know who they are
  return safeStorage()?.getItem(`${KEY_PREFIX}${userId}`) === "1";
}

export function markOnboarded(userId: string | null | undefined): void {
  if (!userId) return;
  safeStorage()?.setItem(`${KEY_PREFIX}${userId}`, "1");
}
