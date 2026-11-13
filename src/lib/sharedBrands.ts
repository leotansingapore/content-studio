// Shared brands on the client (docs/shared-brands.md): which keys a member's device syncs for a brand, the brands
// kept on this device, and the calls behind the Members page, the invite step and the join page. The server decides
// every one of them (037's functions and the brand-team function); nothing here is security state.

import { callFn } from "@/lib/edgeFn";
import { supabase } from "@/lib/supabase";

// 037's cs_brand_keys(), the same two lists (sharedBrands.test.ts reads the SQL file). Members change these:
export const SHARED_PREFIXES = [
  "content-studio-drafts-", "content-studio-plan-", "content-studio-calnotes-", "content-studio-board-", "content-studio-ideas-",
  "content-studio-campaigns-", "content-studio-goals-", "content-studio-angles-", "content-studio-audiences-", "content-studio-products-",
  "content-studio-positioning-", "content-studio-voice-",
] as const;
// ...and only read these: the owner's unattended slideshow campaigns and account audit write from them.
export const READ_ONLY_PREFIXES = [
  "content-studio-carousel-brand-", "content-studio-brandfont-", "content-studio-brandfont2-", "content-studio-brandfont3-",
  "content-studio-brandfont4-", "content-studio-brandfont5-", "content-studio-facts-", "content-studio-learnings-",
] as const;

/** The scope a brand's keys end in (profiles.ts scoped): the owner's id for "me", owner~profile otherwise. */
export const scopeOf = (owner: string, profile: string) => (profile === "me" ? owner : `${owner}~${profile}`);
/** Every key of the brand a member may write, or (writable false) may read. */
export const brandKeys = (scope: string, writable: boolean): string[] =>
  [...SHARED_PREFIXES, ...(writable ? [] : READ_ONLY_PREFIXES)].map((p) => p + scope);

export interface SharedBrand {
  brand: string;
  owner: string;
  profile: string;
  name: string;
  role: "owner" | "member";
}

/** This device's copy of cs_my_brands(), per account. Outside the sync prefix: it never syncs, so it never comes back. */
export const SHARED_CACHE = "cs-shared-brands-";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROFILE = /^(me|p[a-z0-9]{1,39})$/;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const local = (): Store | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

const valid = (x: unknown): x is SharedBrand => {
  const b = x as SharedBrand | null;
  return !!b && UUID.test(b.brand) && UUID.test(b.owner) && PROFILE.test(b.profile) && typeof b.name === "string" && !!b.name.trim() && (b.role === "owner" || b.role === "member");
};

export function readSharedBrands(userId: string | null | undefined, s: Store | null = local()): SharedBrand[] {
  if (!userId || !s) return [];
  try {
    const list = JSON.parse(s.getItem(SHARED_CACHE + userId) ?? "[]");
    return Array.isArray(list) ? list.filter(valid) : [];
  } catch {
    return [];
  }
}

export function writeSharedBrands(userId: string, list: SharedBrand[], s: Store | null = local()) {
  try {
    s?.setItem(SHARED_CACHE + userId, JSON.stringify(list.filter(valid)));
  } catch {
    // storage full: the brands show again once the next read is kept
  }
}

/** The id a shared brand has in this account's switcher: never the owner's profile id, which could be "me". */
export const localId = (brand: string) => `s${brand.replace(/-/g, "").toLowerCase()}`;

/** cs_my_brands(): the brands this account owns (once shared) or is on. Null when it can't be read. */
export async function fetchMyBrands(): Promise<SharedBrand[] | null> {
  try {
    const { data, error } = await supabase.rpc("cs_my_brands");
    if (error || !Array.isArray(data)) return null;
    return (data as { brand_id: string; owner_id: string; profile_id: string; name: string; role: string }[])
      .map((r) => ({ brand: r.brand_id, owner: r.owner_id, profile: r.profile_id, name: r.name, role: r.role as SharedBrand["role"] }))
      .filter(valid);
  } catch {
    return null;
  }
}

// ---- the team ----

export interface TeamRow {
  kind: "owner" | "member" | "invite";
  id: string;
  email: string;
  at: string;
  expires_at: string | null;
  last_edit: string | null;
}

export interface TeamLine {
  id: string;
  kind: TeamRow["kind"];
  email: string;
  status: "Owner" | "Joined" | "Invited" | "Expired";
  /** One line under the email: when they last changed something, or when the invite runs out. */
  note: string;
}

const ago = (iso: string | null, now: number): string => {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 60) return mins <= 1 ? "just now" : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
};

/** The team list as the page shows it: the owner first, then people who joined, then invites (live before expired). */
export function teamLines(rows: TeamRow[], now: number): TeamLine[] {
  const order = { Owner: 0, Joined: 1, Invited: 2, Expired: 3 };
  return rows
    .map((r): TeamLine => {
      if (r.kind === "owner") return { id: r.id, kind: r.kind, email: r.email, status: "Owner", note: "" };
      if (r.kind === "member") return { id: r.id, kind: r.kind, email: r.email, status: "Joined", note: r.last_edit ? `Last edit ${ago(r.last_edit, now)}` : "No edits yet" };
      const expired = !!r.expires_at && Date.parse(r.expires_at) <= now;
      const days = r.expires_at ? Math.max(1, Math.ceil((Date.parse(r.expires_at) - now) / 86_400_000)) : 0;
      return { id: r.id, kind: r.kind, email: r.email, status: expired ? "Expired" : "Invited", note: expired ? "The link ran out" : `Link works for ${days} more ${days === 1 ? "day" : "days"}` };
    })
    .sort((a, b) => order[a.status] - order[b.status] || a.email.localeCompare(b.email));
}

const said = (error: unknown) => String((error as { message?: string } | null)?.message ?? "");
// 037 not applied yet: the function isn't there, which means nothing is shared
const missing = (error: unknown) => (error as { code?: string } | null)?.code === "PGRST202";

export async function brandTeam(brand: string): Promise<TeamRow[]> {
  const { data, error } = await supabase.rpc("cs_brand_team", { p_brand: brand });
  if (error) throw new Error("Couldn't load the team. Try again in a minute.");
  return (data ?? []) as TeamRow[];
}

/** Emails an invite. The answer is the same whether or not the address has an account. */
export async function inviteToBrand(profileId: string, name: string, email: string): Promise<{ email: string }> {
  return callFn<{ email: string }>("brand-team", { action: "invite", profileId, name, email }, "Couldn't send the invite. Try again in a minute.");
}

export async function removeMember(brand: string, member: string) {
  const { error } = await supabase.rpc("cs_brand_remove", { p_brand: brand, p_member: member });
  if (error) throw new Error("Couldn't remove them. Try again in a minute.");
}

export async function revokeInvite(invite: string) {
  const { error } = await supabase.rpc("cs_brand_revoke", { p_invite: invite });
  if (error) throw new Error("Couldn't turn that invite off. Try again in a minute.");
}

export async function leaveBrand(brand: string) {
  const { error } = await supabase.rpc("cs_brand_leave", { p_brand: brand });
  if (error) throw new Error("Couldn't leave just now. Try again in a minute.");
}

/** The owner removed the brand: it stops being shared first. Nothing to do before 037 is applied. */
export async function forgetBrand(profileId: string) {
  const { error } = await supabase.rpc("cs_brand_forget", { p_profile: profileId });
  if (error && !missing(error)) throw new Error("Couldn't stop sharing the brand. Try again in a minute.");
}

/** What the person is told when a save to a shared brand didn't land (brandSync onLost). */
export function lostMessage(why: string): string {
  if (why === "held_post") return "That post is scheduled to go out, so only the brand's owner can change it.";
  if (why === "unsafe_link") return "That change has a link that can't be shared, so it didn't save.";
  if (why === "too_big") return "That change is too big to share, so it didn't save.";
  if (why === "key_not_shared") return "Only the brand's owner can change this.";
  return "Your last change didn't save: someone else on this brand changed it first.";
}

// ---- joining ----

/** Where the join page keeps the token between the email, the sign-in and the accept: outside the sync prefix. */
export const INVITE_KEY = "cs-brand-invite";

/** The invite token: from the link's fragment (which never reaches a server log or the sign-in redirect), else the one
 * this device kept while the person signed in. Null when neither is a token. */
export function inviteToken(hash: string, kept: string | null): string | null {
  const fromLink = hash.replace(/^#/, "");
  const ok = (t: string | null) => !!t && /^[A-Za-z0-9_-]{43}$/.test(t);
  return ok(fromLink) ? fromLink : ok(kept) ? kept : null;
}

/** For a live link: the email to sign in with and the brand's name (the server makes the account if it has none). */
export async function startInvite(token: string): Promise<{ email: string; brand: string }> {
  return callFn<{ email: string; brand: string }>("brand-team", { action: "start", token }, "Couldn't open this invite. Try again in a minute.");
}

export function acceptRefusal(message: string): string {
  if (message.includes("invite_gone")) return "This invite has expired or was already used. Ask for a new one.";
  if (message.includes("wrong_account")) return "This invite was sent to another email. Sign in with that one.";
  if (message.includes("owner_self")) return "This brand is already yours.";
  return "Couldn't join just now. Try again in a minute.";
}

/** Takes the invite for the signed-in account; the brand's id, or an Error in plain words. */
export async function acceptInvite(token: string): Promise<string> {
  const { data, error } = await supabase.rpc("cs_brand_accept", { p_token: token });
  if (error || typeof data !== "string") throw new Error(acceptRefusal(said(error)));
  return data;
}

/** The gate for a member account: whether an owner's plan covers it (brand-team covered). A failure lets it in. */
export async function teamCoversMe(): Promise<boolean> {
  try {
    const { covered } = await Promise.race([
      callFn<{ covered: boolean }>("brand-team", { action: "covered" }),
      new Promise<{ covered: boolean }>((r) => setTimeout(() => r({ covered: true }), 4_000)),
    ]);
    return covered !== false;
  } catch {
    return true;
  }
}
