// Social profiles: one account runs several brands (Leo: himself, MoneyBees,
// FINternship). Each profile gets its own posts, board, plan, voice,
// positioning, social handles and recruit kit; academy progress, bookmarks and
// onboarding stay with the account.
//
// Storage: per-profile modules key their data on scoped(userId), which is the
// bare user id for the default profile (so every existing key keeps working)
// and `${userId}~${profileId}` for the others. The list syncs across devices
// (content-studio- prefix); which profile is open is per device.

export interface Profile {
  id: string;
  name: string;
  createdAt: string;
}

export const DEFAULT_PROFILE_ID = "me";
const LIST_PREFIX = "content-studio-profiles-";
const ACTIVE_PREFIX = "cs-active-profile-"; // deliberately outside the sync prefix
const SYNC_PREFIX = "content-studio-";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadProfiles(userId: string | null | undefined): Profile[] {
  const fallback: Profile = { id: DEFAULT_PROFILE_ID, name: "Me", createdAt: "" };
  const s = storage();
  if (!s || !userId) return [fallback];
  try {
    const parsed = JSON.parse(s.getItem(LIST_PREFIX + userId) ?? "[]");
    const list = Array.isArray(parsed) ? (parsed as Profile[]).filter((p) => p && p.id && p.name) : [];
    return list.some((p) => p.id === DEFAULT_PROFILE_ID) ? list : [fallback, ...list];
  } catch {
    return [fallback];
  }
}

function saveProfiles(userId: string, list: Profile[]): Profile[] {
  storage()?.setItem(LIST_PREFIX + userId, JSON.stringify(list));
  return list;
}

export function addProfile(userId: string, name: string): Profile {
  // Base-36 time + a random tail: never shaped like a UUID, which cloudSync
  // reads as a user id when it decides which keys belong to this account.
  const p: Profile = {
    id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim().slice(0, 40),
    createdAt: new Date().toISOString(),
  };
  saveProfiles(userId, [...loadProfiles(userId), p]);
  return p;
}

export function renameProfile(userId: string, id: string, name: string): Profile[] {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) return loadProfiles(userId);
  return saveProfiles(userId, loadProfiles(userId).map((p) => (p.id === id ? { ...p, name: trimmed } : p)));
}

/** Removes a profile and everything stored under it. The default profile stays. */
export function removeProfile(userId: string, id: string): Profile[] {
  if (id === DEFAULT_PROFILE_ID) return loadProfiles(userId);
  const s = storage();
  if (s) {
    const suffix = `${userId}~${id}`;
    const doomed: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      // a turned-off Claude link's revoked row stays: the sync has no tombstones, so deleting it
      // would let a device that still holds the link bring it back to life (claudeConnect.ts)
      if (k && k.startsWith(SYNC_PREFIX) && k.endsWith(suffix) && !k.startsWith("content-studio-mcprevoked-")) doomed.push(k);
    }
    doomed.forEach((k) => s.removeItem(k));
    if (activeProfileId(userId) === id) setActiveProfile(userId, DEFAULT_PROFILE_ID);
  }
  return saveProfiles(userId, loadProfiles(userId).filter((p) => p.id !== id));
}

export function activeProfileId(userId: string | null | undefined): string {
  if (!userId) return DEFAULT_PROFILE_ID;
  const id = storage()?.getItem(ACTIVE_PREFIX + userId);
  return id && loadProfiles(userId).some((p) => p.id === id) ? id : DEFAULT_PROFILE_ID;
}

export function activeProfile(userId: string | null | undefined): Profile {
  const id = activeProfileId(userId);
  return loadProfiles(userId).find((p) => p.id === id) ?? loadProfiles(userId)[0];
}

export function setActiveProfile(userId: string, id: string): void {
  storage()?.setItem(ACTIVE_PREFIX + userId, id);
}

/** The id per-profile stores key their data on. */
export function scoped<T extends string | null | undefined>(userId: T): T {
  if (!userId) return userId;
  const id = activeProfileId(userId);
  return (id === DEFAULT_PROFILE_ID ? userId : `${userId}~${id}`) as T;
}
