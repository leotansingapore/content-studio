// Your brand from your website (brand-from-website, Leo only): a deep brand-dna read of the open brand's site. The read
// runs outside React, so leaving /brand keeps it going; its answer then waits on this device (cs-brand-read-<scoped>,
// a draft, never synced) until Save or Discard. mergeRead turns the review's picks into each store's write: the kit
// through BrandPage's setBrand, the rest through their own savers. Nothing the brand already has changes unless its
// card says "Use this".

import { toast } from "@/hooks/use-toast";
import { AUDIENCE_NAMES, isDna, NETWORKS, type BrandDna } from "@/lib/addBrand";
import { DEFAULT_BRAND, normalizeHex, type CarouselBrand } from "@/lib/carousel";
import { callFn, EdgeError } from "@/lib/edgeFn";
import type { PostLang } from "@/lib/links";
import { loadMarket, saveMarket, type MarketState } from "@/lib/market";
import { EMPTY_POSITIONING, loadPositioning, savePositioning, type Positioning } from "@/lib/positioning";
import { scoped } from "@/lib/profiles";
import { loadSocialAccounts, saveSocialAccounts, type SocialAccounts } from "@/lib/socialAccounts";
import { loadVoiceProfile, saveVoiceProfile, type VoiceProfile } from "@/lib/voiceProfile";

/** brand-dna's deep answer plus when it came back. */
export interface SiteRead extends BrandDna {
  pagesRead: string[];
  lang: PostLang | null;
  readAt: string;
}
export const FIELDS = ["name", "logo", "colour", "social", "does", "who", "topics", "edge", "voice"] as const;
export type Field = (typeof FIELDS)[number];
export const FIELD_TITLES: Record<Field, string> = {
  name: "Name", logo: "Logo", colour: "Colour", social: "Social accounts", does: "What you do", who: "Who it's for",
  topics: "Topics", edge: "Why people pick you", voice: "How you sound",
};
export type Pick = "keep" | "use";
/** The read waiting for review, and the cards pressed so far. */
export interface Waiting {
  read: SiteRead;
  picks: Partial<Record<Field, Pick>>;
}
/** What the brand has today, read from its stores. */
export interface Current {
  kit: CarouselBrand;
  positioning: Positioning | null;
  voice: VoiceProfile | null;
  accounts: SocialAccounts;
  market: MarketState;
}
export interface Row {
  field: Field;
  mine: string;
  found: string;
  /** Nothing to decide: the site gave nothing, or the same as the brand has. */
  same: boolean;
  /** "use" when the brand has nothing here yet, else "keep". */
  start: Pick;
}

export const REFUSED = "This isn't switched on for your account yet.";
export const hostOf = (address: string) => {
  try {
    return new URL(/^https?:\/\//i.test(address.trim()) ? address.trim() : `https://${address.trim()}`).host.replace(/^www\./, "");
  } catch {
    return address.trim();
  }
};
export const failedLine = (address: string) => `We couldn't open ${hostOf(address)}. Check the address and try again.`;
export const readKey = (userId: string) => `cs-brand-read-${scoped(userId)}`;

export const currentOf = (userId: string, kit: CarouselBrand): Current => ({
  kit,
  positioning: loadPositioning(userId),
  voice: loadVoiceProfile(userId),
  accounts: loadSocialAccounts(userId),
  market: loadMarket(userId),
});

/** "https://www.instagram.com/acme.sg/" and "@acme.sg" both read "acme.sg". */
const bare = (h: string) =>
  h.trim().replace(/^https?:\/\//i, "").replace(/^(www|m)\./i, "").replace(/^(instagram|facebook|fb|tiktok|linkedin)\.com\//i, "")
    .replace(/^@/, "").replace(/\/+$/, "").toLowerCase();

/** A life stage of "Everyone" (also Jev's silence) never replaces a narrower one the brand has. */
const audienceOf = (c: Current, found: BrandDna) =>
  found.audience === "general" && c.positioning && c.positioning.audience !== "general" ? c.positioning.audience : found.audience;

/** Each review card: what the brand has beside what the site gave, as the words the card shows. */
export function reviewRows(c: Current, found: BrandDna): Row[] {
  const p = c.positioning;
  const who = (audience: keyof typeof AUDIENCE_NAMES | undefined, detail: string) =>
    [audience && audience !== "general" ? AUDIENCE_NAMES[audience] : "", detail.trim()].filter(Boolean).join(": ");
  const socials = NETWORKS.filter((n) => found.handles[n.key]?.trim());
  const pairs: Record<Field, [string, string]> = {
    name: [c.kit.name.trim(), found.name.trim()],
    logo: [c.kit.logo ?? "", found.logo ?? ""],
    // the default colour is nobody's choice, so it counts as empty
    colour: [c.kit.color === DEFAULT_BRAND.color ? "" : c.kit.color, normalizeHex(found.colour ?? "") ?? ""],
    social: [
      NETWORKS.filter((n) => c.accounts[n.key]?.handle.trim()).map((n) => `${n.label} ${bare(c.accounts[n.key]!.handle)}`).join(", "),
      socials.map((n) => `${n.label} ${bare(found.handles[n.key]!)}`).join(", "),
    ],
    does: [p?.oneLiner.trim() ?? "", found.oneLiner.trim()],
    who: [who(p?.audience, p?.audienceDetail ?? ""), who(audienceOf(c, found), found.audienceDetail)],
    topics: [(p?.topics ?? []).join(", "), found.topics.join(", ")],
    edge: [p?.edge.trim() ?? "", found.edge.trim()],
    voice: [c.voice?.voiceSummary?.trim() ?? "", found.voice.trim()],
  };
  return FIELDS.map((field) => {
    const [mine, f] = pairs[field];
    // social is the same when every network the site names is already saved with that handle
    const same = !f || (field === "social"
      ? socials.every((n) => bare(c.accounts[n.key]?.handle ?? "") === bare(found.handles[n.key]!))
      : field === "colour" ? normalizeHex(mine) === f : mine.toLowerCase() === f.toLowerCase());
    return { field, mine, found: f, same, start: mine ? "keep" : "use" };
  });
}

/** Each store's write for Save: only the cards set to "Use this", plus the site and when it was read. */
export interface Writes {
  kit: Partial<CarouselBrand>;
  positioning?: Positioning;
  voice?: VoiceProfile;
  accounts?: SocialAccounts;
  market?: MarketState;
}

export function mergeRead(c: Current, found: SiteRead, picks: Partial<Record<Field, Pick>>, now = new Date()): Writes {
  const use = new Set(reviewRows(c, found).filter((r) => !r.same && (picks[r.field] ?? r.start) === "use").map((r) => r.field));
  const at = now.toISOString();
  const w: Writes = { kit: { website: found.url, websiteReadAt: found.readAt } };
  if (use.has("name")) w.kit.name = found.name.trim();
  if (use.has("logo") && found.logo) w.kit.logo = found.logo;
  if (use.has("colour") && found.colour) w.kit.color = normalizeHex(found.colour) ?? c.kit.color;
  if (use.has("social")) {
    // as /brands/new: each network the site names, plus the kit's Instagram, Facebook and handle; other networks stay
    const accounts = { ...c.accounts };
    for (const n of NETWORKS) {
      const h = found.handles[n.key]?.trim().replace(/^@/, "");
      if (h) accounts[n.key] = { handle: n.base + h, connectedAt: c.accounts[n.key]?.connectedAt ?? at };
    }
    w.accounts = accounts;
    const ig = found.handles.instagram?.trim().replace(/^@/, "");
    if (ig) Object.assign(w.kit, { instagram: ig, handle: `@${ig}` });
    if (found.handles.facebook?.trim()) w.kit.facebook = found.handles.facebook.trim();
  }
  if (["does", "who", "topics", "edge"].some((f) => use.has(f as Field))) {
    const p = { ...(c.positioning ?? EMPTY_POSITIONING), updatedAt: at };
    if (use.has("does")) p.oneLiner = found.oneLiner.trim();
    if (use.has("who")) Object.assign(p, { audience: audienceOf(c, found), audienceDetail: found.audienceDetail.trim() });
    if (use.has("topics")) p.topics = found.topics;
    if (use.has("edge")) p.edge = found.edge.trim();
    w.positioning = p;
  }
  // the pasted posts stay: /brands/new starts them empty only because a new brand has none
  if (use.has("voice")) w.voice = { posts: c.voice?.posts ?? [], voiceSummary: found.voice.trim(), updatedAt: at };
  if (!c.market.site.trim()) w.market = { ...c.market, site: hostOf(found.url) };
  return w;
}

// ---- The waiting read (device) -----------------------------------------------------------------------------------

// a copy in memory too, so a read too big for full storage still reaches its review on this visit
const memory = new Map<string, Waiting>();

const isRead = (r: unknown): r is SiteRead => {
  const x = r as Record<string, unknown>;
  return isDna(r) && Array.isArray(x.pagesRead) && x.pagesRead.every((p) => typeof p === "string") && typeof x.readAt === "string";
};

export function loadWaiting(userId: string): Waiting | null {
  const key = readKey(userId);
  const kept = memory.get(key);
  if (kept) return kept;
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!v || !isRead(v.read)) return null;
    const picks = v.picks && typeof v.picks === "object" ? v.picks : {};
    return { read: v.read, picks: Object.fromEntries(FIELDS.filter((f) => picks[f] === "keep" || picks[f] === "use").map((f) => [f, picks[f]])) };
  } catch {
    return null;
  }
}

function keep(key: string, w: Waiting | null): void {
  if (w) memory.set(key, w);
  else memory.delete(key);
  try {
    if (w) localStorage.setItem(key, JSON.stringify(w));
    else localStorage.removeItem(key);
  } catch {
    // storage full or blocked: the memory copy serves this visit
  }
  emit();
}

export function setPick(userId: string, field: Field, pick: Pick): void {
  const w = loadWaiting(userId);
  if (w) keep(readKey(userId), { ...w, picks: { ...w.picks, [field]: pick } });
}

/** Save: every store's write, then the waiting read is gone. Returns what was written. */
export function saveRead(userId: string, kit: CarouselBrand, setBrand: (patch: Partial<CarouselBrand>) => void, now = new Date()): Writes | null {
  const w = loadWaiting(userId);
  if (!w) return null;
  const writes = mergeRead(currentOf(userId, kit), w.read, w.picks, now);
  setBrand(writes.kit);
  if (writes.positioning) savePositioning(userId, writes.positioning);
  if (writes.voice) saveVoiceProfile(userId, writes.voice);
  if (writes.accounts) saveSocialAccounts(userId, writes.accounts);
  if (writes.market) saveMarket(userId, writes.market);
  keep(readKey(userId), null);
  return writes;
}

export const discardRead = (userId: string) => keep(readKey(userId), null);

// ---- The read itself (outside React) -----------------------------------------------------------------------------

export interface Reading {
  address: string;
  startedAt: number;
}
const reading = new Map<string, Reading>();
const failed = new Map<string, string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function onBrandRead(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const readingNow = (userId: string): Reading | undefined => reading.get(readKey(userId));
export const readFailed = (userId: string): string | undefined => failed.get(readKey(userId));

export async function startRead(userId: string, address: string, now = Date.now): Promise<void> {
  // the brand open when the read starts is the one it saves to
  const key = readKey(userId);
  if (reading.has(key) || !address.trim()) return;
  reading.set(key, { address: address.trim(), startedAt: now() });
  failed.delete(key);
  emit();
  let line = "";
  try {
    const d = await callFn<Omit<SiteRead, "readAt">>("brand-dna", { url: address.trim(), deep: true }, failedLine(address));
    const read = { ...d, pagesRead: Array.isArray(d.pagesRead) ? d.pagesRead : [d.url], lang: d.lang ?? null, readAt: new Date(now()).toISOString() };
    // an answer of another shape would break the review cards (and the page with them): it counts as a failed read
    if (!isRead(read)) throw new Error(failedLine(address));
    keep(key, { read, picks: {} });
  } catch (e) {
    const err = e instanceof EdgeError ? e : null;
    // brand-dna's own 422 ends "or start with just a name", which only fits /brands/new
    line = err?.status === 422 ? failedLine(address) : err?.status === 403 ? REFUSED : err?.message || failedLine(address);
    failed.set(key, line);
  } finally {
    reading.delete(key);
    emit();
  }
  // left /brand while it read: say so where they are
  if (typeof location !== "undefined" && location.pathname !== "/brand")
    toast(line ? { title: line, variant: "destructive" } : { title: "Your website read is ready", description: "Open Brand kit to check it." });
}
