// Me and Product for the script desk (wave 1, Leo only): who says the scripts and what they sell,
// synced per brand under content-studio-script-context-<scoped>. Me is edited on /voice, Product on /brand, the
// avatar's lists on /audiences. deskContext() gathers everything the script-desk function's messages may say.

import { loadAudiences } from "@/lib/audiences";
import { loadPositioning } from "@/lib/positioning";
import { loadProducts, mainProduct } from "@/lib/products";
import { scoped } from "@/lib/profiles";
import { loadVoiceProfile } from "@/lib/voiceProfile";

export const SCRIPT_CONTEXT_CHANGED = "content-studio-script-context-changed";
const PREFIX = "content-studio-script-context-";
export const scriptContextKey = (userId: string) => PREFIX + scoped(userId);

/** Me; the lists are typed one a line. */
export interface MeFields {
  on: boolean;
  name: string;
  handle: string;
  what: string;
  story: string;
  results: string;
  beliefs: string;
  /** The niche every script is written for. */
  niche: string;
}

/** Product. */
export interface ProductFields {
  on: boolean;
  name: string;
  website: string;
  what: string;
  who: string;
  problem: string;
  how: string;
  gets: string;
  proof: string;
  replaces: string;
  price: string;
  cta: string;
}

export interface ScriptContext {
  me: MeFields;
  product: ProductFields;
}

export const EMPTY_ME: MeFields = { on: true, name: "", handle: "", what: "", story: "", results: "", beliefs: "", niche: "" };
export const EMPTY_PRODUCT: ProductFields = { on: true, name: "", website: "", what: "", who: "", problem: "", how: "", gets: "", proof: "", replaces: "", price: "", cta: "" };
export const FIELD_MAX = 1500;

/** The stored side over its empty default: each field only in its own type (a switch a boolean, the rest text). */
function fill<T extends MeFields | ProductFields>(base: T, raw: unknown): T {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = { ...base };
  for (const [k, d] of Object.entries(base)) {
    const v = r[k];
    if (typeof d === "boolean" && typeof v === "boolean") out[k] = v;
    if (typeof d === "string" && typeof v === "string") out[k] = v.slice(0, FIELD_MAX);
  }
  return out as T;
}

export function loadScriptContext(userId: string | null | undefined): ScriptContext {
  if (!userId) return { me: EMPTY_ME, product: EMPTY_PRODUCT };
  try {
    const raw = JSON.parse(localStorage.getItem(scriptContextKey(userId)) ?? "{}");
    return { me: fill(EMPTY_ME, raw?.me), product: fill(EMPTY_PRODUCT, raw?.product) };
  } catch {
    return { me: EMPTY_ME, product: EMPTY_PRODUCT };
  }
}

/** Saves one side, read fresh so a save on /voice never undoes one on /brand. False when the device is out of room. */
export function saveScriptContext(userId: string, patch: Partial<ScriptContext>): boolean {
  const next = { ...loadScriptContext(userId), ...patch, updatedAt: new Date().toISOString() };
  try {
    localStorage.setItem(scriptContextKey(userId), JSON.stringify(next));
  } catch {
    return false;
  }
  globalThis.dispatchEvent?.(new Event(SCRIPT_CONTEXT_CHANGED));
  return true;
}

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/** The voice sample: the brand's first pasted post on /voice long enough to show a voice. */
const sampleOf = (userId: string) => loadVoiceProfile(userId)?.posts.find((p) => p && p.trim().length >= 100)?.trim() ?? "";

/**
 * What the script-desk messages may say about the creator: Me and Product while their switch is on (Product's empty
 * fields filled from the brand kit's main product), the brand's
 * main audience, the niche (typed on /voice, else the positioning's topics) and a voice sample. The server cleans and
 * clips all of it again (script-desk logic.ts sanitizeContext).
 */
export function deskContext(userId: string) {
  const { me, product: typed } = loadScriptContext(userId);
  // a field left empty takes the brand kit's main product (/brand, Products), where there is one
  const kit = mainProduct(loadProducts(userId).items);
  const product = kit
    ? { ...typed, name: typed.name || kit.name, what: typed.what || kit.what, who: typed.who || kit.forWho, price: typed.price || (kit.price ?? ""), website: typed.website || (kit.url ?? "") }
    : typed;
  const main = loadAudiences(userId)[0] ?? null;
  const topics = loadPositioning(userId)?.topics ?? [];
  return {
    avatar: main ? { name: main.name, who: main.who, pains: main.pains ?? [], fears: main.fears ?? [], desires: main.desires ?? [], days: main.days ?? [] } : null,
    niche: me.niche.trim() || topics.join(", "),
    sample: sampleOf(userId),
    me: me.on ? { name: me.name, handle: me.handle, what: me.what, story: me.story, results: lines(me.results), beliefs: lines(me.beliefs) } : null,
    product: product.on
      ? { name: product.name, website: product.website, what: product.what, who: product.who, problem: product.problem, how: lines(product.how), gets: product.gets, proof: product.proof, replaces: product.replaces, price: product.price, cta: product.cta }
      : null,
  };
}

/** True once the brand has a main audience, so Avatar use writes for it ("No audience yet" otherwise). */
export const hasAvatar = (userId: string) => loadAudiences(userId).length > 0;
