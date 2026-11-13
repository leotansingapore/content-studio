// Add a brand's unfinished forms (/brands, /brands/new?draft=<id>): what the person typed or picked, kept on every
// device so a half-done brand survives closing the tab. One synced key holds the list, merged item by item
// (cloudSync.ts), never one key per draft. The three newest at most and never the logo (a data URL): localStorage is
// near its quota on big accounts. The tab keeps its own full copy (sessionStorage, logo included) for reloads.
// No runtime imports: cloudSync.ts imports this file.

export const DRAFTS_PREFIX = "content-studio-brand-drafts-";
export const MAX_DRAFTS = 3;

// sessionStorage, outside the synced prefix: this tab's copy of the form, the logo still in it
export const keptBrandKey = (userId: string) => `cs-addbrand-form-${userId}`;

export interface BrandDraft {
  id: string;
  /** The site's host, "" before one is typed. */
  host: string;
  /** The brand's name from the read, "" before one. */
  name: string;
  /** The step it was left on (/brands/new?step=). */
  step: string;
  updatedAt: string;
  /** BrandSetup's kept form (its snapshot), with no logo. */
  form: Record<string, unknown>;
}

type TabStore = Pick<Storage, "setItem" | "removeItem">;

const key = (uid: string) => DRAFTS_PREFIX + uid;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isDraft = (d: unknown): d is BrandDraft =>
  obj(d) && ["id", "host", "name", "step", "updatedAt"].every((k) => typeof d[k] === "string") && obj(d.form);

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Newest first, MAX_DRAFTS at most: the stored list, and the merge of two devices' lists. */
export const capDrafts = <T extends { updatedAt?: unknown }>(list: T[]): T[] =>
  [...list].sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""))).slice(0, MAX_DRAFTS);

export function loadDrafts(uid: string): BrandDraft[] {
  try {
    const v = JSON.parse(store()?.getItem(key(uid)) ?? "[]");
    return Array.isArray(v) ? capDrafts(v.filter(isDraft)) : [];
  } catch {
    return [];
  }
}

function write(uid: string, list: BrandDraft[]) {
  try {
    store()?.setItem(key(uid), JSON.stringify(list));
  } catch {
    // storage full: the tab's own copy still holds the form
  }
}

function hostOf(address: string): string {
  const a = address.trim();
  try {
    return new URL(/^https?:\/\//i.test(a) ? a : `https://${a}`).hostname.replace(/^www\./, "");
  } catch {
    return a;
  }
}

/** Saves the form (BrandSetup's snapshot, as text) as draft `id`, on top, without its logo. */
export function saveDraft(uid: string, id: string, raw: string, now = new Date()): BrandDraft[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return loadDrafts(uid);
  }
  if (!obj(parsed)) return loadDrafts(uid);
  const { draft: _mark, ...rest } = parsed;
  const dna: Record<string, unknown> | null = obj(rest.dna) ? { ...rest.dna, logo: null } : null;
  const form = { ...rest, dna };
  const list = loadDrafts(uid);
  const old = list.find((d) => d.id === id);
  if (old && JSON.stringify(old.form) === JSON.stringify(form)) return list;
  const address = typeof rest.address === "string" ? rest.address : "";
  const next = capDrafts([
    {
      id,
      host: address.trim() ? hostOf(address) : "",
      name: typeof dna?.name === "string" ? dna.name.trim().slice(0, 40) : "",
      step: typeof rest.step === "string" ? rest.step : "site",
      updatedAt: now.toISOString(),
      form,
    },
    ...list.filter((d) => d.id !== id),
  ]);
  write(uid, next);
  return next;
}

export function removeDraft(uid: string, id: string): BrandDraft[] {
  const next = loadDrafts(uid).filter((d) => d.id !== id);
  write(uid, next);
  return next;
}

// base-36 time and a random tail, as profile ids: never shaped like a UUID
const newDraftId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * /brands/new's persist: the form as draft `id` (a new one when null) and the tab's copy, marked with the draft it
 * belongs to. null (nothing typed any more, or the brand was made) removes both. Returns the open draft's id.
 */
export function keepForm(uid: string, id: string | null, value: string | null, tab: TabStore): string | null {
  try {
    if (value === null) {
      if (id) removeDraft(uid, id);
      tab.removeItem(keptBrandKey(uid));
      return null;
    }
    const open = id ?? newDraftId();
    saveDraft(uid, open, value);
    tab.setItem(keptBrandKey(uid), JSON.stringify({ ...JSON.parse(value), draft: open }));
    return open;
  } catch {
    return id;
  }
}

const markOf = (raw: string | null): string | null => {
  try {
    const v = JSON.parse(raw ?? "null");
    return obj(v) && typeof v.draft === "string" ? v.draft : null;
  } catch {
    return null;
  }
};

/**
 * What /brands/new opens on: the draft the address names (from the tab's copy when it is that draft's, since it still
 * has the logo), else the tab's copy when it belongs to no draft (a tab from before drafts), else a new form. New brand
 * from a tab that holds a draft starts empty: the draft waits on /brands.
 */
export function keptFor(tab: string | null, drafts: BrandDraft[], wanted: string | null): { kept: string | null; draft: string | null } {
  const mark = markOf(tab);
  const d = wanted ? drafts.find((x) => x.id === wanted) : undefined;
  if (d) return { kept: mark === d.id ? tab : JSON.stringify(d.form), draft: d.id };
  return { kept: !wanted && !mark ? tab : null, draft: null };
}

/** Where a draft's card resumes it: its step, the default (site) left out. */
export const draftLink = (d: Pick<BrandDraft, "id" | "step">) =>
  `/brands/new?draft=${encodeURIComponent(d.id)}${d.step && d.step !== "site" ? `&step=${encodeURIComponent(d.step)}` : ""}`;

/** The colour behind a draft's initial: the first one picked, else the read's. */
export function draftColour(d: Pick<BrandDraft, "form">): string | null {
  const picked = Array.isArray(d.form.colours) ? d.form.colours.find((c): c is string => typeof c === "string") : undefined;
  const read = obj(d.form.dna) && typeof d.form.dna.colour === "string" ? d.form.dna.colour : null;
  return picked ?? read;
}
