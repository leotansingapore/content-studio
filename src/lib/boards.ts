// Saved boards (Discover > Saved, Leo only; docs/north-star/items/find-save-anywhere.md): any post, ad, trend or
// pasted link, filed into boards. One synced key per brand, written whole on every change (like Following), so a
// removal stays removed on every device without a tombstone. A pasted Instagram or TikTok link is read by clone-reel's
// style mode (the reel-style cap, no OpenAI) in a job outside React; its transcript stays on this device.

import { callFn, type EdgeError } from "@/lib/edgeFn";
import { links } from "@/lib/links";
import { scoped } from "@/lib/profiles";
import { sourceKey, type RemixSource, type RemixSourceKind, type SourceFormat } from "@/lib/remixSource";
import { parseReelUrl, type CloneSource } from "../../supabase/functions/clone-reel/logic.ts";
import { parseRemixLink } from "../../supabase/functions/remix-link/logic.ts";

export type SavePlatform = "instagram" | "tiktok" | "youtube" | "meta-ad" | "linkedin" | "x" | "facebook" | "web";
export type ReadState = "pending" | "done" | "failed" | "capped" | "none";
/** The platform chips on the page, as ?platform= carries them. */
export type PlatformChip = "instagram" | "tiktok" | "youtube" | "ad" | "link";

export interface Board {
  id: string;
  name: string;
  createdAt: string;
}

export interface BoardItem {
  /** A remix source key: top:..., ad:..., follow:..., trend:..., or link:<platform>:<id> for anything pasted. */
  key: string;
  kind: RemixSourceKind;
  url: string;
  platform: SavePlatform;
  format?: SourceFormat;
  title: string;
  /** At most 300 characters. */
  caption: string;
  author: string;
  /** Only an app path (/covers, /ads): outside pictures expire. */
  cover: string;
  numbers: { views?: number; likes?: number; comments?: number; daysRunning?: number };
  postedAt: string;
  savedAt: string;
  /** Empty = Unsorted. */
  boards: string[];
  note: string;
  read: ReadState;
}

export interface BoardsState {
  boards: Board[];
  /** Newest first. */
  items: BoardItem[];
}

export const MAX_BOARDS = 20;
export const MAX_ITEMS = 500;
export const MAX_CAPTION = 300;
export const MAX_NOTE = 500;
export const MAX_BOARD_NAME = 40;
const MAX_TRANSCRIPTS = 60;
/** A read this tab is not running, older than this, has died with its tab: it shows as failed, with Try again. */
const READ_STALE_MS = 3 * 60_000;

export const PLATFORMS: SavePlatform[] = ["instagram", "tiktok", "youtube", "meta-ad", "linkedin", "x", "facebook", "web"];
export const PLATFORM_CHIPS: Record<PlatformChip, SavePlatform[]> = {
  instagram: ["instagram"],
  tiktok: ["tiktok"],
  youtube: ["youtube"],
  ad: ["meta-ad"],
  link: ["linkedin", "x", "facebook", "web"],
};
export const PLATFORM_NAME: Record<SavePlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  "meta-ad": "Meta ad",
  linkedin: "LinkedIn",
  x: "X",
  facebook: "Facebook",
  web: "Link",
};

export const SAVE_COPY = {
  bad: "That isn't a link we can save. Copy it from the app's Share button and paste it here.",
  already: "Already saved.",
  full: `You have ${MAX_ITEMS} saved posts in this brand. Remove some to save more.`,
  storage: "Couldn't save on this device. Its storage is full.",
  boardCap: `You can have up to ${MAX_BOARDS} boards.`,
  boardDup: "You already have a board called that.",
} as const;

export const READ_CHIP: Partial<Record<ReadState, string>> = {
  pending: "Reading the post",
  failed: "Couldn't read it",
  capped: "Reads used up today. Try again after 8am.",
  none: "Link only",
};

const KEY = "content-studio-boards-";
const CHANGED = "content-studio-boards-changed";
const TRANSCRIPTS = "cs-transcripts-";
const LAST_BOARD = "cs-saved-board";
export const boardsKey = (userId: string) => KEY + scoped(userId);
const transcriptsKey = (userId: string) => TRANSCRIPTS + scoped(userId);

// ---- the store ---------------------------------------------------------------------------------------------------

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
const READS: ReadState[] = ["pending", "done", "failed", "capped", "none"];

function cleanNumbers(raw: unknown): BoardItem["numbers"] {
  const n = (raw ?? {}) as Record<string, unknown>;
  const out = { views: count(n.views), likes: count(n.likes), comments: count(n.comments), daysRunning: count(n.daysRunning) };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}

function cleanItem(raw: unknown, boardIds: Set<string>): BoardItem | null {
  const r = raw as Record<string, unknown> | null;
  const key = str(r?.key, 200);
  if (!key || typeof r?.kind !== "string") return null;
  const url = str(r.url, 2000);
  const cover = str(r.cover, 500);
  return {
    key,
    kind: r.kind as RemixSourceKind,
    url: /^https?:\/\//.test(url) ? url : "",
    platform: PLATFORMS.includes(r.platform as SavePlatform) ? (r.platform as SavePlatform) : "web",
    ...(["video", "carousel", "image", "text"].includes(r.format as string) ? { format: r.format as SourceFormat } : {}),
    title: str(r.title, 120),
    caption: str(r.caption, MAX_CAPTION),
    author: str(r.author, 80),
    cover: /^\/[^/]/.test(cover) ? cover : "",
    numbers: cleanNumbers(r.numbers),
    postedAt: str(r.postedAt, 40),
    savedAt: str(r.savedAt, 40),
    boards: (Array.isArray(r.boards) ? r.boards : []).filter((b): b is string => typeof b === "string" && boardIds.has(b)),
    note: str(r.note, MAX_NOTE),
    read: READS.includes(r.read as ReadState) ? (r.read as ReadState) : "none",
  };
}

function parseState(raw: string | null): BoardsState {
  try {
    const v = JSON.parse(raw ?? "null");
    if (!v || typeof v !== "object") return { boards: [], items: [] };
    const boards = (Array.isArray(v.boards) ? v.boards : [])
      .map((b: Record<string, unknown> | null) => ({ id: str(b?.id, 40), name: str(b?.name, MAX_BOARD_NAME), createdAt: str(b?.createdAt, 40) }))
      .filter((b: Board) => b.id && b.name)
      .slice(0, MAX_BOARDS);
    const ids = new Set<string>(boards.map((b: Board) => b.id));
    const seen = new Set<string>();
    const items = (Array.isArray(v.items) ? v.items : [])
      .map((i: unknown) => cleanItem(i, ids))
      .filter((i: BoardItem | null): i is BoardItem => i !== null && !seen.has(i.key) && Boolean(seen.add(i.key)))
      .slice(0, MAX_ITEMS);
    return { boards, items };
  } catch {
    return { boards: [], items: [] };
  }
}

// Cards call this once each per render: parse again only when the stored text changed.
let memo: { k: string; raw: string | null; v: BoardsState } | null = null;

function loadAt(k: string): BoardsState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(k);
  } catch {
    // blocked storage reads as empty
  }
  if (memo?.k === k && memo.raw === raw) return memo.v;
  memo = { k, raw, v: parseState(raw) };
  return memo.v;
}

/** Writes the whole store; when storage is full, cuts captions to 100 characters, then drops them. Never drops items. */
function saveAt(k: string, s: BoardsState): boolean {
  const cut = (n: number): BoardsState => ({ ...s, items: s.items.map((i) => ({ ...i, caption: i.caption.slice(0, n) })) });
  let ok = false;
  for (const t of [s, cut(100), cut(0)]) {
    try {
      localStorage.setItem(k, JSON.stringify(t));
      ok = true;
      break;
    } catch {
      // storage full: the next, smaller try
    }
  }
  globalThis.dispatchEvent?.(new Event(CHANGED));
  return ok;
}

export const loadBoards = (userId: string) => loadAt(boardsKey(userId));

/** Calls `cb` whenever the store is saved on this device (a page, a Save button, or a read landing). */
export function onBoardsChanged(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
}

export const findItem = (s: BoardsState, key: string) => s.items.find((i) => i.key === key);

export type AddResult =
  | { ok: true; item: BoardItem }
  | { ok: false; reason: "duplicate"; existing: BoardItem }
  | { ok: false; reason: "full" | "storage" };

/** Files an item at the top, on the boards named that exist (none = Unsorted). The same key or link saves once. */
export function addItem(userId: string, item: BoardItem, boards: string[] = [], now = new Date()): AddResult {
  const k = boardsKey(userId);
  const s = loadAt(k);
  const existing = s.items.find((i) => i.key === item.key || (item.url && i.url === item.url));
  if (existing) return { ok: false, reason: "duplicate", existing };
  if (s.items.length >= MAX_ITEMS) return { ok: false, reason: "full" };
  const next: BoardItem = { ...item, boards: boards.filter((b) => s.boards.some((x) => x.id === b)), savedAt: now.toISOString() };
  return saveAt(k, { ...s, items: [next, ...s.items] }) ? { ok: true, item: next } : { ok: false, reason: "storage" };
}

export interface Removed {
  item: BoardItem;
  index: number;
}

/** Takes an item out and returns it with its place, so Undo can put it back. */
export function removeItem(userId: string, key: string): Removed | null {
  const k = boardsKey(userId);
  const s = loadAt(k);
  const index = s.items.findIndex((i) => i.key === key);
  if (index < 0) return null;
  saveAt(k, { ...s, items: s.items.filter((i) => i.key !== key) });
  return { item: s.items[index], index };
}

/** Undo: the item back in its place, on the boards that still exist. */
export function restoreItem(userId: string, r: Removed): boolean {
  const k = boardsKey(userId);
  const s = loadAt(k);
  if (s.items.length >= MAX_ITEMS || s.items.some((i) => i.key === r.item.key)) return false;
  const item = { ...r.item, boards: r.item.boards.filter((b) => s.boards.some((x) => x.id === b)) };
  return saveAt(k, { ...s, items: [...s.items.slice(0, r.index), item, ...s.items.slice(r.index)] });
}

function patchAt(k: string, key: string, patch: Partial<BoardItem>): BoardItem | null {
  const s = loadAt(k);
  const row = findItem(s, key);
  if (!row) return null;
  const next = { ...row, ...patch };
  saveAt(k, { ...s, items: s.items.map((i) => (i.key === key ? next : i)) });
  return next;
}

/** The boards an item is on; none = Unsorted. */
export function setItemBoards(userId: string, key: string, boards: string[]): BoardItem | null {
  const s = loadBoards(userId);
  return patchAt(boardsKey(userId), key, { boards: [...new Set(boards)].filter((b) => s.boards.some((x) => x.id === b)) });
}

export const setNote = (userId: string, key: string, note: string) => patchAt(boardsKey(userId), key, { note: note.slice(0, MAX_NOTE) });

export type BoardResult = { ok: true; board: Board } | { ok: false; reason: "empty" | "duplicate" | "cap" };

export function addBoard(userId: string, name: string, now = new Date()): BoardResult {
  const k = boardsKey(userId);
  const s = loadAt(k);
  const clean = name.replace(/\s+/g, " ").trim().slice(0, MAX_BOARD_NAME);
  if (!clean) return { ok: false, reason: "empty" };
  if (s.boards.some((b) => b.name.toLowerCase() === clean.toLowerCase())) return { ok: false, reason: "duplicate" };
  if (s.boards.length >= MAX_BOARDS) return { ok: false, reason: "cap" };
  let id = "";
  while (!id || s.boards.some((b) => b.id === id)) id = `b-${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 4)}`;
  const board = { id, name: clean, createdAt: now.toISOString() };
  saveAt(k, { ...s, boards: [...s.boards, board] });
  return { ok: true, board };
}

/** The board goes; its items stay, and an item on no other board becomes Unsorted. */
export function deleteBoard(userId: string, id: string): void {
  const k = boardsKey(userId);
  const s = loadAt(k);
  saveAt(k, { boards: s.boards.filter((b) => b.id !== id), items: s.items.map((i) => (i.boards.includes(id) ? { ...i, boards: i.boards.filter((b) => b !== id) } : i)) });
}

/** The board a Save on this device files into: the last one used if this brand has it, else Unsorted (""). */
export function lastBoard(userId: string): string {
  try {
    const id = localStorage.getItem(LAST_BOARD) ?? "";
    return loadBoards(userId).boards.some((b) => b.id === id) ? id : "";
  } catch {
    return "";
  }
}

export function rememberBoard(id: string): void {
  try {
    localStorage.setItem(LAST_BOARD, id);
  } catch {
    // a device hint only
  }
}

// ---- what the page shows ------------------------------------------------------------------------------------------

export const isUnsorted = (i: BoardItem) => i.boards.length === 0;

export function boardCounts(s: BoardsState): Record<string, number> {
  const out: Record<string, number> = { all: s.items.length, unsorted: s.items.filter(isUnsorted).length };
  for (const b of s.boards) out[b.id] = s.items.filter((i) => i.boards.includes(b.id)).length;
  return out;
}

/** "youtube.com/watch?v=abc": what a link-only card is called when it has no note. */
export function hostPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "")}${u.search}`.slice(0, 80);
  } catch {
    return url.slice(0, 80);
  }
}

/** The name an item goes by: its own title, else the note, else the link's host and path. Never the caption. */
export const titleOf = (i: BoardItem) => i.title || i.note.split("\n")[0].slice(0, 120) || hostPath(i.url);

/** board: all | unsorted | a board id; platform: all | a chip; q: every word in the title, caption, author or note. */
export function filterItems(items: BoardItem[], f: { board: string; platform: string; q: string }): BoardItem[] {
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const chip = PLATFORM_CHIPS[f.platform as PlatformChip];
  return items.filter((i) => {
    if (f.board === "unsorted" ? !isUnsorted(i) : f.board !== "all" && !i.boards.includes(f.board)) return false;
    if (chip && !chip.includes(i.platform)) return false;
    const hay = `${i.title} ${i.caption} ${i.author} ${i.note}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** The read state to show: a pending read this tab isn't running, saved a while ago, died with its tab. */
export const readShown = (i: BoardItem, now = Date.now()): ReadState =>
  i.read === "pending" && !isReading(i.key) && now - Date.parse(i.savedAt || "0") > READ_STALE_MS ? "failed" : i.read;

// ---- links ------------------------------------------------------------------------------------------------------

export type ParsedSave = { ok: true; platform: SavePlatform; url: string; id: string | null; read: "pending" | "none" } | { ok: false; message: string };

const TIKTOK_HOSTS = /^(?:www\.|m\.)?tiktok\.com$/;
const IP_HOST = /^\d{1,3}(?:\.\d{1,3}){3}$|^\[/;

/**
 * The first link in pasted or shared text, by remix-any-link's table (parseRemixLink); Instagram and TikTok posts
 * get read. A TikTok photo slideshow is Link only, and any other http(s) page is "web". Refuses other schemes,
 * credentials, ports, IP hosts and anything over 2,000 characters.
 */
export function parseSaveLink(text: string): ParsedSave {
  const bad = { ok: false as const, message: SAVE_COPY.bad };
  const p = parseRemixLink(text);
  if (p.ok) return { ok: true, platform: p.kind, url: p.url, id: p.id, read: p.kind === "instagram" || p.kind === "tiktok" ? "pending" : "none" };
  const raw = text.match(/https?:\/\/\S+/i)?.[0];
  if (!raw || raw.length > 2000) return bad;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return bad;
  }
  const host = u.hostname.toLowerCase();
  if (u.username || u.password || u.port || IP_HOST.test(host) || !host.includes(".")) return bad;
  const photo = TIKTOK_HOSTS.test(host) ? u.pathname.match(/^\/(@[A-Za-z0-9._]{1,64})\/photo\/(\d{15,25})\/?$/) : null;
  if (photo) return { ok: true, platform: "tiktok", url: `https://www.tiktok.com/${photo[1]}/photo/${photo[2]}`, id: photo[2], read: "none" };
  return { ok: true, platform: "web", url: `${u.protocol}//${host}${u.pathname}${u.search}`, id: null, read: "none" };
}

async function sha12(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

/** link:<platform>:<id>; a page or a short link with no id of its own uses the first 12 hex of its link's SHA-1. */
export const linkKey = async (p: Extract<ParsedSave, { ok: true }>) => sourceKey.link(p.platform, p.id ?? (await sha12(p.url)));

export type SaveLinkResult = AddResult | { ok: false; reason: "bad" };

/** The paste box and the /saved?url= landing: parse, file on `board` ("" = Unsorted), and read it when it can be read. */
export async function saveLink(userId: string, text: string, board: string, title = ""): Promise<SaveLinkResult> {
  const p = parseSaveLink(text);
  if (!p.ok) return { ok: false, reason: "bad" };
  const item: BoardItem = {
    key: await linkKey(p),
    kind: "link",
    url: p.url,
    platform: p.platform,
    title: title.trim().slice(0, 120),
    caption: "",
    author: "",
    cover: "",
    numbers: {},
    postedAt: "",
    savedAt: "",
    boards: [],
    note: "",
    read: p.read,
  };
  const r = addItem(userId, item, board ? [board] : []);
  if (r.ok && r.item.read === "pending") void runRead(userId, r.item.key);
  return r;
}

// ---- in-app sources -----------------------------------------------------------------------------------------------

/** A card's remix source as a saved item. Only a link from outside gets read; an in-app item carries its own text. */
export function toBoardItem(s: RemixSource): BoardItem {
  const platform: SavePlatform = s.kind === "ad" ? "meta-ad" : PLATFORMS.includes(s.platform as SavePlatform) ? (s.platform as SavePlatform) : "web";
  const url = s.url ?? "";
  const readable = s.kind === "link" && (platform === "instagram" || platform === "tiktok") && parseReelUrl(url).ok;
  return {
    key: s.key,
    kind: s.kind,
    url,
    platform,
    ...(s.format ? { format: s.format } : {}),
    title: (s.title ?? "").slice(0, 120),
    caption: (s.caption ?? "").slice(0, MAX_CAPTION),
    author: s.author ?? "",
    cover: s.cover && /^\/[^/]/.test(s.cover) ? s.cover : "",
    numbers: cleanNumbers(s.numbers),
    postedAt: s.postedAt ?? "",
    savedAt: "",
    boards: [],
    note: "",
    read: readable ? "pending" : s.kind === "link" ? "none" : "done",
  };
}

/** A saved item back as the remix source the sheet opens (decision 18: no new source kinds). */
export function fromSavedItem(i: BoardItem): RemixSource {
  const s: RemixSource = {
    key: i.key,
    kind: i.kind,
    format: i.format,
    platform: i.platform === "web" ? undefined : i.platform,
    url: i.url.startsWith("https://") ? i.url : undefined,
    author: i.author || undefined,
    title: (i.title || i.caption.split("\n")[0] || titleOf(i)).slice(0, 120),
    caption: i.caption || undefined,
    cover: i.cover || undefined,
    numbers: Object.keys(i.numbers).length ? i.numbers : undefined,
    postedAt: i.postedAt || undefined,
    remixedAt: "",
  };
  return Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as unknown as RemixSource;
}

const WRITE_LINE = "Write my own take on this. Do not copy its wording. No promised returns, no named insurer products, no invented numbers.";

/** The link behind Remix before the session is read: an Instagram or TikTok video to Clone a reel, anything else to Write. */
export function remixUrlFor(i: BoardItem): string {
  const reel = i.platform === "instagram" || i.platform === "tiktok" ? parseReelUrl(i.url) : null;
  if (reel?.ok && i.format !== "image" && i.format !== "carousel") return links.clone({ url: reel.url });
  const ctx = [`Saved from ${i.author || PLATFORM_NAME[i.platform]}: ${i.url}`, `What it is: ${titleOf(i)}`, i.note && `My note: ${i.note}`, WRITE_LINE];
  return `/generate?${new URLSearchParams({ pillar: "topic", detail: titleOf(i).slice(0, 80), ctx: ctx.filter(Boolean).join("\n"), source: i.key })}`;
}

// ---- reading a post (outside React) ------------------------------------------------------------------------------

const reading = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const isReading = (key: string) => reading.has(key);
export function onReads(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function loadTranscripts(userId: string): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(transcriptsKey(userId)) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Device only, newest 60 (find-ai-tagging reads it); 20 when storage is full. Never in the synced key. */
function keepTranscript(k: string, key: string, text: string): void {
  let all: Record<string, string> = {};
  try {
    all = JSON.parse(localStorage.getItem(k) ?? "{}") ?? {};
  } catch {
    all = {};
  }
  delete all[key];
  const entries = [[key, text.slice(0, 8000)], ...Object.entries(all)];
  for (const n of [MAX_TRANSCRIPTS, 20]) {
    try {
      localStorage.setItem(k, JSON.stringify(Object.fromEntries(entries.slice(0, n))));
      return;
    } catch {
      // storage full: keep fewer
    }
  }
}

/** Reads an Instagram or TikTok link once with clone-reel's style mode; caption, author and numbers land on the item. */
export async function runRead(userId: string, key: string): Promise<void> {
  // the brand open now: a brand switch mid-read must not write into the other brand
  const k = boardsKey(userId);
  const tk = transcriptsKey(userId);
  const item = findItem(loadAt(k), key);
  if (!item || reading.has(key) || item.kind !== "link" || !parseReelUrl(item.url).ok) return;
  reading.add(key);
  if (item.read !== "pending") patchAt(k, key, { read: "pending" });
  emit();
  try {
    const { source: s } = await callFn<{ source: CloneSource }>("clone-reel", { url: item.url, style: true }, "Couldn't read that post right now.");
    const m = s.metrics;
    const done = patchAt(k, key, {
      read: "done",
      caption: (s.caption ?? "").trim().slice(0, MAX_CAPTION),
      author: s.author ? `@${s.author.replace(/^@+/, "")}` : item.author,
      numbers: cleanNumbers({ views: m?.views ?? undefined, likes: m?.likes ?? undefined, comments: m?.comments ?? undefined }),
      postedAt: s.postedAt?.slice(0, 10) ?? "",
      format: s.isVideo ? "video" : "image",
    });
    if (done && s.transcript) keepTranscript(tk, key, s.transcript);
  } catch (e) {
    patchAt(k, key, { read: (e as EdgeError).status === 429 ? "capped" : "failed" });
  } finally {
    reading.delete(key);
    emit();
  }
}
