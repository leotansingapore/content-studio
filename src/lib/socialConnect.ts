// Social accounts (Playbook > Social accounts, /accounts): an adviser's own Instagram, Facebook, TikTok,
// LinkedIn, YouTube and Threads accounts, connected through Zernio by the `social` edge function
// (docs/zernio-connection.md). The server decides who may connect and checks every id; this device
// only remembers the last answer so the nav can hide the page while it is off.

import { callFn, EdgeError } from "@/lib/edgeFn";
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
    await callFn("social", { action: "status" });
    rememberSocialConnect(true);
    return true;
  } catch (e) {
    if (e instanceof EdgeError && e.status === 404) {
      rememberSocialConnect(false);
      return false;
    }
    return known?.on === true;
  }
}

export const isNotEnabled = (e: unknown) => e instanceof EdgeError && e.status === 404 && /not enabled/i.test(e.message);

export const socialStatus = (profileId: string) =>
  callFn<SocialStatus>("social", { action: "status", profileId }, "Couldn't load your accounts. Try again in a minute.");

export const connectLink = (profileId: string, platform: SocialPlatform, reconnectAccountId?: string) =>
  callFn<{ authUrl: string }>("social", { action: "connect", profileId, platform, reconnectAccountId }, "Couldn't start the connection. Try again in a minute.");

export const disconnectOne = (profileId: string, accountId: string) =>
  callFn<{ disconnected: number }>("social", { action: "disconnect", profileId, accountId }, "Couldn't disconnect it. Try again in a minute.");

/**
 * Before a brand profile is removed: its connected accounts would otherwise keep running (and billing)
 * in Zernio with nothing in the app to reach them (M6). Throws when they couldn't be disconnected.
 */
export async function disconnectBrand(profileId: string): Promise<void> {
  try {
    await callFn("social", { action: "disconnect", profileId, all: true });
  } catch (e) {
    // not switched on for this sign-in: nothing was ever connected through it
    if (isNotEnabled(e)) return;
    throw e;
  }
}

/** The line under the connect buttons when no account can be added, or null. */
export function capLine(s: Pick<SocialStatus, "team" | "teamCap" | "user" | "userCap">): string | null {
  if (s.user >= s.userCap) return `${s.user} of ${s.userCap} accounts connected, the most one adviser can have. Disconnect one to connect another.`;
  if (s.team >= s.teamCap) return `${s.team} of ${s.teamCap} accounts connected. Disconnect one to connect another.`;
  return null;
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
