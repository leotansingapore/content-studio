// Social profiles: one account runs several brands (Leo: himself, MoneyBees,
// FINternship). Each profile gets its own posts, board, plan, voice,
// positioning, social handles and recruit kit; academy progress, bookmarks and
// onboarding stay with the account.
//
// Storage: per-profile modules key their data on scoped(userId), which is the
// bare user id for the default profile (so every existing key keeps working)
// and `${userId}~${profileId}` for the others. The list syncs across devices
// (content-studio- prefix); which profile is open is per device.

import { disconnectBrand } from "@/lib/socialConnect";

export interface Profile {
  id: string;
  name: string;
  createdAt: string;
  /** The posts-board brand this brand owns (moneybees-reels studio/api/_db.js BRANDS id), for /reels. */
  boardBrand?: string;
}

export const DEFAULT_PROFILE_ID = "me";
const LIST_PREFIX = "content-studio-profiles-";
const ACTIVE_PREFIX = "cs-active-profile-"; // deliberately outside the sync prefix
const SYNC_PREFIX = "content-studio-";
// Connect Claude's rows (claudeConnect.ts), named here because it imports this module
const LINK = "content-studio-mcplink-";
const REVOKED = "content-studio-mcprevoked-";

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

/** Gives a brand its posts-board brand; a board brand belongs to one brand, so any other link to it goes. */
export function linkBoardBrand(userId: string, profileId: string, boardBrand: string): Profile[] {
  return saveProfiles(userId, loadProfiles(userId).map((p) =>
    p.id === profileId ? { ...p, boardBrand } : p.boardBrand === boardBrand ? { ...p, boardBrand: undefined } : p));
}

export const profileForBoardBrand = (userId: string, boardBrand: string) => loadProfiles(userId).find((p) => p.boardBrand === boardBrand);

export function renameProfile(userId: string, id: string, name: string): Profile[] {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) return loadProfiles(userId);
  return saveProfiles(userId, loadProfiles(userId).map((p) => (p.id === id ? { ...p, name: trimmed } : p)));
}

/**
 * Removes a profile and everything stored under it. The default profile stays. Its connected social
 * accounts are disconnected first, or they would keep running in Zernio with nothing in the app to reach
 * them; when that fails nothing is removed and the error says why.
 */
export async function removeProfile(userId: string, id: string, cleanup?: (id: string) => Promise<void>): Promise<Profile[]> {
  if (id === DEFAULT_PROFILE_ID) return loadProfiles(userId);
  await disconnectBrand(id);
  // the brand's server rows (its bio page, tracked links): a failure stops here, before anything local goes
  await cleanup?.(id);
  const s = storage();
  if (s) {
    const suffix = `${userId}~${id}`;
    const doomed: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      // a turned-off Claude link's revoked row stays: the sync has no tombstones, so deleting it
      // would let a device that still holds the link bring it back to life (claudeConnect.ts)
      // synced data, and this device's own cs-* data for the brand (drafts in progress, media index)
      if (k && (k.startsWith(SYNC_PREFIX) || k.startsWith("cs-")) && k.endsWith(suffix) && !k.startsWith(REVOKED)) doomed.push(k);
    }
    // a Claude link still on is turned off first, for the same reason: deleting its row alone doesn't stop it
    const revokedAt = JSON.stringify({ revokedAt: new Date().toISOString() });
    for (const k of doomed) if (k.startsWith(LINK)) s.setItem(REVOKED + k.slice(LINK.length), revokedAt);
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

// The signed-in user, known once the studio has loaded, so a copied link can name the open brand.
let knownUser: string | null = null;
export const rememberUser = (userId: string | null) => {
  knownUser = userId;
};

/** A link to this app that opens on the brand open now (?profile=), so it lands right on any device. */
export function withBrand(href: string): string {
  if (!knownUser) return href;
  try {
    const u = new URL(href);
    u.searchParams.set("profile", activeProfileId(knownUser));
    return u.toString();
  } catch {
    return href;
  }
}

/**
 * A ?profile=<id> link switches to that brand first. Returns "reload" when it switched (the caller reloads, as the
 * switcher does), "drop" when the brand is already open (the caller removes the param, so the switcher's own reload
 * can't switch back), or "keep" when this device doesn't know the brand yet (its list may still be syncing).
 */
export function applyBrandLink(userId: string, wanted: string | null): "reload" | "drop" | "keep" | "none" {
  if (!wanted) return "none";
  if (!loadProfiles(userId).some((p) => p.id === wanted)) return "keep";
  if (wanted === activeProfileId(userId)) return "drop";
  setActiveProfile(userId, wanted);
  // only when the switch stuck: blocked storage would otherwise reload forever
  return activeProfileId(userId) === wanted ? "reload" : "drop";
}

/** The brand a business is (a ?business= link, a team post's group): by its name or the posts-board brand it owns. */
export function profileForBusiness(userId: string, business: string | null): string | null {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ""); // channelFeeds' businessKey; importing it would loop
  if (!business || !key(business)) return null;
  return loadProfiles(userId).find((p) => key(p.name) === key(business) || (p.boardBrand && key(p.boardBrand) === key(business)))?.id ?? null;
}

/** The id per-profile stores key their data on. */
export function scoped<T extends string | null | undefined>(userId: T): T {
  if (!userId) return userId;
  const id = activeProfileId(userId);
  return (id === DEFAULT_PROFILE_ID ? userId : `${userId}~${id}`) as T;
}
