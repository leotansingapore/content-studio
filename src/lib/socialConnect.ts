// Social accounts (Playbook > Social accounts, /accounts): an adviser's own Instagram, Facebook, TikTok,
// LinkedIn, YouTube and Threads accounts, connected through Zernio by the `social` edge function
// (docs/zernio-connection.md). The server decides who may connect and checks every id; this device
// only remembers the last answer so the nav can hide the page while it is off.

import { callFn, EdgeError } from "@/lib/edgeFn";
import { scoped } from "@/lib/profiles";
import { SUPABASE_URL } from "@/lib/supabase";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "../../supabase/functions/_shared/zernio.ts";
import type { AccountView, RemovedNote } from "../../supabase/functions/social/logic.ts";

export { SOCIAL_PLATFORMS, type AccountView, type RemovedNote, type SocialPlatform };

export const PLATFORM_NAME: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  threads: "Threads",
};

export const platformName = (p: string) => PLATFORM_NAME[p as SocialPlatform] ?? p;

export interface SocialStatus {
  enabled: true;
  accounts: AccountView[];
  /** Disconnected in the last 30 days for being over the account limit. */
  removed: RemovedNote[];
  team: number;
  teamCap: number;
  user: number;
  userCap: number;
}

// Per device and outside the sync prefix: a hint for the nav, never security state.
const SHOWN_KEY = "cs-social-connect";
const RECHECK_MS = 6 * 3600_000;

function readShown(): { on: boolean; at: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? "null");
    return v && typeof v.on === "boolean" && typeof v.at === "number" ? v : null;
  } catch {
    return null;
  }
}

export function rememberSocialConnect(on: boolean): void {
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify({ on, at: Date.now() }));
  } catch {
    // private mode: the page still works, the nav just keeps it hidden
  }
}

export function forgetSocialConnect(): void {
  try {
    localStorage.removeItem(SHOWN_KEY);
  } catch {
    // nothing stored
  }
}

/** Whether the nav shows Social accounts on this device. */
export const socialConnectShown = (): boolean => readShown()?.on === true;

/** Asks the server whether this sign-in may connect accounts (no Zernio call), at most every 6 hours. */
export async function checkSocialConnect(): Promise<boolean> {
  const known = readShown();
  if (known && Date.now() - known.at < RECHECK_MS) return known.on;
  try {
    // off answers 200 {enabled:false}, so no browser logs a failed request for it
    const on = (await callFn<{ enabled?: unknown }>("social", { action: "status" }))?.enabled === true;
    rememberSocialConnect(on);
    return on;
  } catch (e) {
    if (e instanceof EdgeError && e.status === 404) {
      rememberSocialConnect(false);
      return false;
    }
    return known?.on === true;
  }
}

export const isNotEnabled = (e: unknown) => e instanceof EdgeError && e.status === 404 && /not enabled/i.test(e.message);

/** Reads the brand's accounts (one of the day's social reads) and keeps what the Channels block shows. */
export async function socialStatus(profileId: string): Promise<SocialStatus> {
  const s = await callFn<SocialStatus>("social", { action: "status", profileId }, "Couldn't load your accounts. Try again in a minute.");
  const userId = storedUserId();
  if (userId && Array.isArray(s?.accounts)) saveChannels(userId, profileId, s.accounts);
  return s;
}

/** The signed-in user in the session supabase-js keeps on this device, read without the auth lock (as useLeoOnly). */
function storedUserId(): string | null {
  try {
    const raw = localStorage.getItem(`sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`);
    const id = raw ? JSON.parse(raw)?.user?.id : null;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null; // no session stored: nothing kept, the read still answers
  }
}

// ---- Channels: each brand's accounts as last read here (the sidebar's Channels block, Home's Next up) ----------
// Written by socialStatus on every answer, so the block itself never spends one of the 300 daily social reads.
// Per device and sign-in, outside the sync prefix; platform, handle and health only.

export interface Channel {
  platform: string;
  /** Without the @; empty when the network gave none. */
  username: string;
  /** "error" when it needs reconnecting. */
  health: AccountView["health"];
}
export interface BrandChannels {
  at: number;
  channels: Channel[];
}
const CHANNELS_KEY = "cs-social-channels-";
const CHANNELS_CHANGED = "cs-social-channels-changed";

function readChannels(userId: string): Record<string, unknown> {
  try {
    const v = JSON.parse(localStorage.getItem(CHANNELS_KEY + userId) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function saveChannels(userId: string, profileId: string, accounts: AccountView[]): void {
  const channels: Channel[] = accounts.map((a) => ({
    platform: a.platform,
    username: (a.username ?? "").replace(/^@/, ""),
    health: a.needsReconnect ? "error" : a.health,
  }));
  try {
    localStorage.setItem(CHANNELS_KEY + userId, JSON.stringify({ ...readChannels(userId), [profileId]: { at: Date.now(), channels } }));
  } catch {
    return; // storage full or blocked: the block keeps what it showed
  }
  globalThis.window?.dispatchEvent?.(new Event(CHANNELS_CHANGED));
}

/** The brand's channels as last read on this device, or null when never read here. */
export function loadChannels(userId: string | null | undefined, profileId: string): BrandChannels | null {
  if (!userId) return null;
  const v = readChannels(userId)[profileId] as BrandChannels | undefined;
  return v && typeof v.at === "number" && Array.isArray(v.channels) ? v : null;
}

export function onChannelsChanged(cb: () => void): () => void {
  window.addEventListener(CHANNELS_CHANGED, cb);
  return () => window.removeEventListener(CHANNELS_CHANGED, cb);
}

export const connectLink = (profileId: string, platform: SocialPlatform, reconnectAccountId?: string) =>
  callFn<{ authUrl: string }>("social", { action: "connect", profileId, platform, reconnectAccountId }, "Couldn't start the connection. Try again in a minute.");

export const disconnectOne = (profileId: string, accountId: string) =>
  callFn<{ disconnected: number }>("social", { action: "disconnect", profileId, accountId }, "Couldn't disconnect it. Try again in a minute.");

/**
 * Before a brand profile is removed: its connected accounts would otherwise keep running (and billing)
 * in Zernio with nothing in the app to reach them (M6). Throws when they couldn't be disconnected.
 */
export async function disconnectBrand(profileId: string): Promise<void> {
  // any failure, "Not enabled." too, keeps the brand: the server answers a removal for an adviser off the list
  await callFn("social", { action: "disconnect", profileId, all: true });
}

/** The line under the connect buttons when no account can be added, or null. */
export function capLine(s: Pick<SocialStatus, "team" | "teamCap" | "user" | "userCap">): string | null {
  if (s.user >= s.userCap) return `${s.user} of ${s.userCap} accounts connected, the most one adviser can have. Disconnect one to connect another.`;
  if (s.team >= s.teamCap) return `${s.team} of ${s.teamCap} accounts connected. Disconnect one to connect another.`;
  return null;
}

/** "3 of 6 accounts connected.": the cap is whichever limit stops the next connect; today's cap line once none can be added. */
export function countLine(s: Pick<SocialStatus, "team" | "teamCap" | "user" | "userCap">): string {
  return capLine(s) ?? `${s.user} of ${Math.min(s.userCap, s.user + Math.max(0, s.teamCap - s.team))} accounts connected.`;
}

/** Leo's sign-in sees the bill before he connects (Zernio's list price, docs.zernio.com/pricing). */
export const ZERNIO_PRICE_LINE = "Zernio: first 2 free, then US$6 a month each.";

// ---- A default account per platform (publish-accounts) ----------------------------------------------------------
// Synced per brand: { [platform]: zernioAccountId }. Not security state: the server checks every id it is sent.

export type SocialDefaults = Record<string, string>;
const DEFAULTS_KEY = "content-studio-social-defaults-";
export const SOCIAL_DEFAULTS_CHANGED = "content-studio-social-defaults-changed";

export function loadSocialDefaults(userId: string): SocialDefaults {
  try {
    const raw = JSON.parse(localStorage.getItem(DEFAULTS_KEY + scoped(userId)) ?? "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1]));
  } catch {
    return {};
  }
}

/** False when this device's storage is full (the default saved before stays). */
export function saveSocialDefault(userId: string, platform: string, accountId: string): boolean {
  try {
    localStorage.setItem(DEFAULTS_KEY + scoped(userId), JSON.stringify({ ...loadSocialDefaults(userId), [platform]: accountId }));
  } catch {
    return false;
  }
  globalThis.window?.dispatchEvent?.(new Event(SOCIAL_DEFAULTS_CHANGED));
  return true;
}

/** The account ticked first for a platform: the picked default while it is still connected, else the first connected one. */
export function defaultAccount(accounts: AccountView[], defaults: SocialDefaults, platform: string): string | null {
  const mine = accounts.filter((a) => a.platform === platform);
  return (mine.find((a) => a.id === defaults[platform]) ?? mine[0])?.id ?? null;
}

export interface AccountGroup {
  platform: string;
  name: string;
  accounts: AccountView[];
  /** Default radios show from two accounts on the platform. */
  showDefault: boolean;
  defaultId: string | null;
  /** null for a platform this app can't connect (one connected in Zernio's own dashboard). */
  button: string | null;
}

/** What /accounts draws for Leo: one group per platform in SOCIAL_PLATFORMS order, then any other platform's accounts. */
export function groupAccounts(accounts: AccountView[], defaults: SocialDefaults): AccountGroup[] {
  const others = [...new Set(accounts.map((a) => a.platform))].filter((p) => !(SOCIAL_PLATFORMS as readonly string[]).includes(p));
  return [...SOCIAL_PLATFORMS, ...others].map((platform) => {
    const mine = accounts.filter((a) => a.platform === platform);
    const name = platformName(platform);
    const known = (SOCIAL_PLATFORMS as readonly string[]).includes(platform);
    return {
      platform,
      name,
      accounts: mine,
      showDefault: mine.length >= 2,
      defaultId: defaultAccount(mine, defaults, platform),
      button: !known ? null : mine.length ? `Add another ${name} account` : `Connect ${name}`,
    };
  });
}

// ---- The way back after connecting (publish-accounts) -----------------------------------------------------------
// A connect started from a post (the schedule steps) saves where it was; /accounts offers "Back to your post" when
// Zernio sends the browser back. This tab only (sessionStorage), a device hint with the cs- prefix.

const RETURN_KEY = "cs-connect-return";
const RETURN_MS = 30 * 60_000;
// this app's own paths only: "//host" and "/\host" would leave it
const appPath = (p: unknown): p is string => typeof p === "string" && /^\/(?![/\\])/.test(p);

/** Call with the current path and query just before connectLink sends the browser to Zernio. */
export function saveConnectReturn(path: string, now = Date.now()): void {
  try {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({ path, at: now }));
  } catch {
    // private mode: the connect still works, it just lands on /accounts
  }
}

/** The saved path, while under 30 minutes old and inside this app; else null. */
export function readConnectReturn(now = Date.now()): string | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(RETURN_KEY) ?? "null");
    return v && appPath(v.path) && typeof v.at === "number" && now - v.at >= 0 && now - v.at <= RETURN_MS ? v.path : null;
  } catch {
    return null;
  }
}

export function clearConnectReturn(): void {
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // nothing stored
  }
}

/** What Zernio's redirect back to /accounts says: connected, or the reason it didn't. */
export function readRedirect(q: URLSearchParams): { ok: boolean; text: string } | null {
  const platform = platformName(q.get("platform") || q.get("connected") || "");
  if (q.get("error")) {
    const why = (q.get("error_message") || "").replace(/\s+/g, " ").trim().slice(0, 200);
    return { ok: false, text: `${platform || "The account"} didn't connect.${why ? ` ${why}` : " Try again."}` };
  }
  if (!q.get("connected")) return null;
  const user = (q.get("username") || "").replace(/^@/, "").slice(0, 60);
  return { ok: true, text: `${platform} connected${user ? `: @${user}` : ""}.` };
}

/** One removal in plain words. */
export function removedLine(n: RemovedNote): string {
  const day = new Date(n.at).toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Singapore" });
  const who = n.username ? `@${n.username.replace(/^@/, "")} on ${platformName(n.platform)}` : `Your ${platformName(n.platform)} account`;
  return `${who} was disconnected on ${day} because it went over the account limit.`;
}

export const healthLabel = (a: AccountView) =>
  a.needsReconnect ? "Reconnect needed" : a.health === "healthy" ? "Working" : a.health === "unknown" ? "Checking" : "Needs a look";
