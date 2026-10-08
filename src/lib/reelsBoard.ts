// Reels review board, folded in from MoneyBees Studio (moneybees-studio.vercel.app).
// The board's data and videos stay where they are (MoneyBees Supabase, written
// by the reels pipeline on Leo's Mac); this app reads and writes it through a
// same-origin proxy (/mb-studio/api -> moneybees-studio's /api, see vercel.json
// and vite.config.ts), so no CORS change and no second copy of the data.
//
// That API has no auth of its own (Leo chose "anyone with the link can edit",
// 2026-10-06), so showing the board only to its owner here is a UX gate, not
// a security boundary.

export const REELS_BOARD_OWNERS = ["tanjunsing@gmail.com"];
const API = "/mb-studio/api";

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
}

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
  history: { at: string; from?: string; to: string; note?: string }[];
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

/** Cards for one stage column: scheduled ones by date, then by title. */
export function cardsIn(cards: ReelCard[], stage: StageId, brand: string): ReelCard[] {
  return cards
    .filter((c) => c.stage === stage && (!brand || brandOf(c) === brand))
    .sort((a, b) => (a.schedule || "~").localeCompare(b.schedule || "~") || a.title.localeCompare(b.title));
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(API + path, body === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`The board answered ${r.status}`);
  return r.json() as Promise<T>;
}

export const fetchBoard = () => call<Board>("/board");
export const updateCard = (id: string, patch: Partial<Pick<ReelCard, "stage" | "caption" | "schedule" | "version" | "brand">>) =>
  call<ReelCard>(`/cards/${encodeURIComponent(id)}`, patch);
export const addNote = (id: string, note: { text: string; t?: number | null; slide?: number }) =>
  call<ReelCard>(`/cards/${encodeURIComponent(id)}/comments`, note);
export const resolveNote = (id: string, cid: string, resolved: boolean) =>
  call<ReelCard>(`/cards/${encodeURIComponent(id)}/comments/${encodeURIComponent(cid)}`, { resolved });
