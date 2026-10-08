// The user's own social accounts. Registering a handle "connects" an account —
// it links the advisor's posts to each platform and sets up for future
// auto-sync of metrics. Stored under the content-studio- prefix so cloudSync
// mirrors it across devices (see src/lib/cloudSync.ts).

import { scoped } from "@/lib/profiles";
export type SocialPlatform = "linkedin" | "tiktok" | "instagram" | "facebook";

export const SOCIAL_PLATFORMS: {
  key: SocialPlatform;
  label: string;
  placeholder: string;
  /** URL prefix a bare handle is expanded to. */
  base: string;
}[] = [
  { key: "linkedin", label: "LinkedIn", placeholder: "your-name", base: "https://www.linkedin.com/in/" },
  { key: "tiktok", label: "TikTok", placeholder: "@yourhandle", base: "https://www.tiktok.com/@" },
  { key: "instagram", label: "Instagram", placeholder: "@yourhandle", base: "https://www.instagram.com/" },
  { key: "facebook", label: "Facebook", placeholder: "your.page", base: "https://www.facebook.com/" },
];

export interface SocialAccount {
  /** Exactly what the user typed — a handle (@name) or a full profile URL. */
  handle: string;
  connectedAt: string;
}

export type SocialAccounts = Partial<Record<SocialPlatform, SocialAccount>>;

const KEY_PREFIX = "content-studio-socialaccounts-";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSocialAccounts(userId: string | null | undefined): SocialAccounts {
  const s = storage();
  if (!s || !userId) return {};
  try {
    const parsed = JSON.parse(s.getItem(KEY_PREFIX + scoped(userId)) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveSocialAccounts(
  userId: string,
  accounts: SocialAccounts,
): SocialAccounts {
  const s = storage();
  if (s) s.setItem(KEY_PREFIX + scoped(userId), JSON.stringify(accounts));
  return accounts;
}

/** Set (or, with an empty handle, disconnect) one platform. Returns the map. */
export function setSocialAccount(
  userId: string,
  platform: SocialPlatform,
  handle: string,
): SocialAccounts {
  const current = loadSocialAccounts(userId);
  const trimmed = handle.trim();
  const next: SocialAccounts = { ...current };
  if (!trimmed) {
    delete next[platform];
  } else {
    next[platform] = {
      handle: trimmed,
      connectedAt: current[platform]?.connectedAt ?? new Date().toISOString(),
    };
  }
  return saveSocialAccounts(userId, next);
}

export function connectedCount(accounts: SocialAccounts): number {
  return SOCIAL_PLATFORMS.filter((p) => accounts[p.key]?.handle).length;
}

/** Best-effort profile URL for a registered handle. */
export function accountUrl(platform: SocialPlatform, handle: string): string | null {
  const h = handle.trim();
  if (!h) return null;
  if (/^https?:\/\//i.test(h)) return h;
  const meta = SOCIAL_PLATFORMS.find((p) => p.key === platform);
  if (!meta) return null;
  return meta.base + h.replace(/^@/, "");
}

// Follower counts typed in Add your numbers, by platform, for reach past
// followers. Kept apart from the handles: a count may come without a handle.
const FOLLOWERS_PREFIX = "content-studio-followers-";
export type FollowerCounts = Partial<Record<SocialPlatform, number>>;

export function loadFollowers(userId: string | null | undefined): FollowerCounts {
  const s = storage();
  if (!s || !userId) return {};
  try {
    const parsed = JSON.parse(s.getItem(FOLLOWERS_PREFIX + scoped(userId)) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Sets one platform's count; null, a negative or a non-number clears it. */
export function setFollowers(userId: string, platform: SocialPlatform, count: number | null): FollowerCounts {
  const next: FollowerCounts = { ...loadFollowers(userId) };
  if (count !== null && Number.isFinite(count) && count > 0) next[platform] = Math.round(count);
  else delete next[platform];
  const s = storage();
  if (s) s.setItem(FOLLOWERS_PREFIX + scoped(userId), JSON.stringify(next));
  return next;
}
