// Reels review board, folded in from MoneyBees Studio (moneybees-studio.vercel.app).
// The board's data and videos stay where they are (MoneyBees Supabase, written
// by the reels pipeline on Leo's Mac). This app reaches it only through the
// team-board edge function, which proves who is signed in and passes their role
// and brands to the board; the board decides every read and write against them
// (docs/team-roles.md). Everything here that hides a button is a convenience,
// not the boundary.

import { callFn, EdgeError } from "@/lib/edgeFn";

/** Leo's sign-in. Still gates the channel feeds (public data, every business) and nothing on the board. */
export const REELS_BOARD_OWNERS = ["tanjunsing@gmail.com"];

export type StageId = "review" | "changes" | "approved" | "scheduled" | "posted" | "archived";

export interface ReelVersion {
  file: string;
  label: string;
  mtime: number;
  thumb?: string;
  src?: string;
  thumbUrl?: string;
  slides?: string[];
  slideUrls?: string[];
}

export interface ReelComment {
  id: string;
  at: string;
  text: string;
  t: number | null;
  slide?: number;
  version: string;
  resolved: boolean;
  /** Stamped by the board: missing on Leo's older notes, "claude" on the fix pass's answers. */
  by?: string | { id: string; label: string; role?: string };
  /** Leo sent this teammate's note to the daily fix pass (Fix this). */
  forFix?: { at: string };
}

/** Who wrote a note, for showing beside it; "" for Leo's older notes. Members pick their own account name, so theirs say so. */
export const noteAuthor = (m: ReelComment) =>
  typeof m.by === "object" && m.by ? (m.by.role === "owner" ? m.by.label : `${m.by.label} (team)`) : m.by === "claude" ? "Claude" : "";

/**
 * Board brand -> Instagram handle the Mac publisher posts to at the slot
 * (moneybees-reels/tools/publish_ig.py keeps the same map). A brand missing here
 * is posted by hand.
 */
export const IG_HANDLES: Record<string, string> = {
  moneybees: "the_moneybees",
  finternship: "finternshipofficial",
  activitytracker: "activity_tracker_io",
};

export interface ReelCard {
  id: string;
  title: string;
  brand?: string;
  kind?: "reel" | "carousel";
  stage: StageId;
  style?: string;
  styleName?: string;
  caption?: string;
  schedule?: string;
  version: string;
  versions: ReelVersion[];
  comments: ReelComment[];
  history: { at: string; from?: string; to: string; note?: string; by?: string }[];
  /** Written by the publisher once the post is live. */
  ig?: { state: "publishing" | "posted"; permalink?: string; account?: string; mediaId?: string };
}

/** Where an approved card will go, or went, on Instagram. */
export function igLine(c: ReelCard): { text: string; href?: string } | null {
  const handle = IG_HANDLES[brandOf(c)];
  if (c.ig?.state === "posted") return { text: `On Instagram @${c.ig.account ?? handle}`, href: c.ig.permalink };
  if (c.stage !== "scheduled" && c.stage !== "approved") return null;
  return handle ? { text: `Posts to @${handle} automatically` } : { text: "Not linked to Instagram: post it by hand" };
}

export interface Board {
  stages: { id: StageId; name: string }[];
  brands: { id: string; name: string }[];
  cards: ReelCard[];
}

/** The one-tap next step for each stage, as the original board had it. */
export const NEXT: Partial<Record<StageId, [StageId, string]>> = {
  review: ["approved", "Approve"],
  changes: ["review", "Back to review"],
  approved: ["scheduled", "Schedule"],
  scheduled: ["posted", "Mark posted"],
  archived: ["review", "Restore"],
};
export const FLOW: StageId[] = ["review", "approved", "scheduled", "posted"];

export const brandOf = (c: ReelCard) => c.brand || "moneybees";
export const isCarousel = (c: ReelCard) => c.kind === "carousel";
export const openNotes = (c: ReelCard) => c.comments.filter((m) => !m.resolved).length;
export const currentVersion = (c: ReelCard): ReelVersion => c.versions.find((v) => v.file === c.version) ?? c.versions[0];

export function mmss(t: number | null | undefined): string {
  const s = Math.max(0, Math.floor(t ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The board brand whose name matches the open profile ("MoneyBees" -> moneybees), else none. */
export function brandForProfile(brands: Board["brands"], profileName: string): string {
  const n = profileName.trim().toLowerCase();
  return brands.find((b) => b.name.toLowerCase() === n || b.id === n)?.id ?? "";
}

/** Soonest slot first, undated last, then by title. (localeCompare put a "~" placeholder BEFORE digits.) */
const byDate = (a: ReelCard, b: ReelCard) =>
  Number(!a.schedule) - Number(!b.schedule) || (a.schedule ?? "").localeCompare(b.schedule ?? "") || a.title.localeCompare(b.title);

/** A post's real shape: carousels and picture posts are 4:5 on Instagram, reels 9:16 (thumbs keep their own shape). */
export const aspectOf = (c: ReelCard) => (isCarousel(c) ? "4 / 5" : "9 / 16");

/** The card a ?card= link names. Also accepts the id without its "~style" tail, because some chat apps end a link at "~". */
export function findCard(cards: ReelCard[], id: string | null): ReelCard | undefined {
  if (!id) return undefined;
  return cards.find((c) => c.id === id) ?? cards.find((c) => c.id.split("~")[0] === id.split("~")[0]);
}

/**
 * The Posts view's stage a link should land on: a ?card= link with no ?stage= shows that post's stage behind it,
 * so closing the post leaves it in the list (calendar links and Copy link carry only the card). null = leave it.
 */
export function stageForLink(cards: ReelCard[], search: URLSearchParams): StageId | null {
  if (search.get("stage")) return null;
  const c = findCard(cards, search.get("card"));
  return c && c.stage !== "review" ? c.stage : null;
}

/** Posts view: one stage, or every stage but Archived ("all"), soonest date first, undated last. */
export function feedCards(cards: ReelCard[], stage: StageId | "all", brand: string): ReelCard[] {
  return cards
    .filter((c) => (stage === "all" ? c.stage !== "archived" : c.stage === stage) && (!brand || brandOf(c) === brand))
    .sort(byDate);
}

/** Cards for one stage column: scheduled ones by date, then by title. */
export function cardsIn(cards: ReelCard[], stage: StageId, brand: string): ReelCard[] {
  return cards
    .filter((c) => c.stage === stage && (!brand || brandOf(c) === brand))
    .sort(byDate);
}

const board = <T>(body: Record<string, unknown>) => callFn<T>("team-board", body, "The board didn't answer. Try again.");
export const fetchBoard = () => board<Board>({ action: "board" });
export const updateCard = (id: string, patch: Partial<Pick<ReelCard, "stage" | "caption" | "schedule" | "version" | "brand">>) =>
  board<ReelCard>({ action: "card", id, patch });
export const addNote = (id: string, note: { text: string; t?: number | null; slide?: number }) =>
  board<ReelCard>({ action: "comment", id, ...note });
export const resolveNote = (id: string, cid: string, resolved: boolean) => board<ReelCard>({ action: "resolve", id, cid, resolved });
/** Leo sends a teammate's note to the daily fix pass; the post moves to Needs changes. */
export const sendToFix = (id: string, cid: string) => board<ReelCard>({ action: "endorse", id, cid });
/** A teammate's note the fix pass acts on without Leo: from an editor or approver. A commenter's needs Fix this. */
export const fixesOnItsOwn = (m: ReelComment) => typeof m.by === "object" && !!m.by && (m.by.role === "editor" || m.by.role === "approver");

// ---- Who is looking: Leo, a team member, or neither (docs/team-roles.md) ----

export type Role = "viewer" | "commenter" | "editor" | "approver";
export interface Me {
  owner: boolean;
  member: boolean;
  id?: string;
  role?: Role | "owner";
  brands?: string[];
  modules?: string[];
  label?: string;
}
export const ROLE_NAMES: Record<Role, string> = { viewer: "Viewer", commenter: "Commenter", editor: "Editor", approver: "Approver" };
export const ROLE_HELP: Record<Role, string> = {
  viewer: "Sees the posts, nothing else",
  commenter: "Leaves notes on posts",
  editor: "Edits words, dates and versions before approval",
  approver: "Approves, schedules and archives posts",
};

export const seesBoard = (me: Me | null) => !!me && (me.owner || (me.member && !!me.modules?.includes("reels")));

const RANK: Record<string, number> = { viewer: 0, commenter: 1, editor: 2, approver: 3, owner: 4 };

/** What the signed-in person may do to a card: a mirror of the board's own rules, so the screen offers only what will work. */
export function perms(me: Me | null, c: ReelCard) {
  const owner = !!me?.owner;
  const r = owner ? 4 : RANK[me?.role ?? ""] ?? -1;
  const live = c.stage === "posted" || !!c.ig?.state;
  const open = c.stage === "review" || c.stage === "changes";
  return {
    note: r >= 1,
    edit: owner || (!live && (r >= 3 || (r >= 2 && open))),
    move: (to: StageId) => owner || (!live && to !== "posted" && (r >= 3 || (r >= 2 && open && (to === "review" || to === "changes")))),
    brand: owner,
    resolve: (m: ReelComment) => owner || (r >= 1 && typeof m.by === "object" && !!m.by && m.by.id === me?.id),
  };
}

// Per device and outside the sync prefix: a hint for the nav, never security state.
const ME_KEY = "cs-team-me";
const ME_RECHECK_MS = 10 * 60_000;

function readMe(): (Me & { at: number }) | null {
  try {
    const v = JSON.parse(localStorage.getItem(ME_KEY) ?? "null");
    return v && typeof v.owner === "boolean" && typeof v.at === "number" ? v : null;
  } catch {
    return null;
  }
}

/** Whether the nav shows Reels on this device. */
export const reelsShown = (): boolean => seesBoard(readMe());

/** Asks the server who this sign-in is on the team, at most every 10 minutes unless forced. */
export async function checkMe(force = false): Promise<Me> {
  const known = readMe();
  if (known && !force && Date.now() - known.at < ME_RECHECK_MS) return known;
  try {
    const me = await callFn<Me>("team-board", { action: "me" });
    try {
      localStorage.setItem(ME_KEY, JSON.stringify({ ...me, at: Date.now() }));
    } catch {
      // private mode: the page still asks the server each time
    }
    return me;
  } catch (e) {
    if (known) return known;
    throw e;
  }
}

export function forgetMe(): void {
  try {
    localStorage.removeItem(ME_KEY);
  } catch {
    // nothing stored
  }
}

/** A refusal that means this person's access changed mid-session (removed, or their role changed). */
export const accessChanged = (e: unknown) => e instanceof EdgeError && (e.status === 403 || e.status === 401);
export const errorText = (e: unknown, fallback: string) => (e instanceof EdgeError && e.status > 0 ? e.message : fallback);

// ---- The team, for Leo (/reels/team) ----

export interface TeamMember {
  id: string;
  /** From their own account (name, else the start of their email). */
  label: string;
  role: Role;
  brands: string[];
  email: string | null;
  status: "joined" | "removed";
  created_at: string;
}
/** A link Leo shares: whoever opens it while it works joins with its role and brands. */
export interface TeamLink {
  id: string;
  role: Role;
  brands: string[];
  expires_at: string;
  max_uses: number | null;
  uses: number;
  status: "active" | "expired" | "used" | "off";
  created_at: string;
}
const team = <T>(body: Record<string, unknown>) => callFn<T>("team-board", body);
export const listTeam = () => team<{ members: TeamMember[]; links: TeamLink[] }>({ action: "team.list" });
export const createLink = (l: { role: Role; brands: string[] }) => team<{ link: TeamLink; url: string }>({ action: "team.invite", ...l });
export const linkOff = (id: string) => team<{ off: true }>({ action: "team.linkOff", id });
export const updateMember = (id: string, patch: Partial<Pick<TeamMember, "role" | "brands">>) =>
  team<{ member: TeamMember }>({ action: "team.update", id, ...patch }).then((r) => r.member);
export const revokeMember = (id: string) => team<{ revoked: true }>({ action: "team.revoke", id });
export const claimInvite = (token: string) => team<{ joined: true; role: Role; brands: string[] }>({ action: "claim", token });
