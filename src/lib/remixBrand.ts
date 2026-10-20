// What a remix wears (docs/north-star/items/remix-your-brand.md): the switches the sheet's For row remembers per
// brand, and the one brand block each make call carries, built from the brand kit, positioning and the coach
// profile of the brand open now.

import { brandOffers, brandRulesLine } from "@/lib/brandRules";
import { loadBrand } from "@/lib/carousel";
import { coachContext, loadCoachProfile } from "@/lib/coachProfile";
import { loadPositioning } from "@/lib/positioning";
import { activeProfile, scoped } from "@/lib/profiles";
import { VOICE_IDS, type VoiceId } from "@/lib/textVoice";
import type { BrandPack } from "../../supabase/functions/remix/logic.ts";

export interface RemixPrefs {
  mention: boolean;
  /** The offer's name, from the brand kit. */
  offer: string | null;
  /** 'new' makes an AI presenter; a presenter id later. 'mine' waits for people-my-face. */
  face: "new" | string;
  /** 'mine' waits for people-my-voice. */
  voice: VoiceId;
}

const KEY = "content-studio-remix-prefs-";
export const DEFAULT_PREFS: RemixPrefs = { mention: true, offer: null, face: "new", voice: "alice" };

function store(): Storage | null {
  try {
    return globalThis.window?.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The brand kit's offers a post may point to, by name. */
export const offerNames = (userId: string) => brandOffers(loadBrand(userId)).map((o) => o.name);

/** Synced per brand. A renamed or deleted offer, or anything unreadable, falls back to the default. */
export function loadRemixPrefs(userId: string): RemixPrefs {
  let raw: Partial<RemixPrefs> = {};
  try {
    raw = JSON.parse(store()?.getItem(KEY + scoped(userId)) ?? "{}") ?? {};
  } catch {
    raw = {};
  }
  return {
    mention: typeof raw.mention === "boolean" ? raw.mention : DEFAULT_PREFS.mention,
    offer: typeof raw.offer === "string" && offerNames(userId).includes(raw.offer) ? raw.offer : null,
    face: typeof raw.face === "string" && raw.face && raw.face !== "mine" ? raw.face : DEFAULT_PREFS.face,
    voice: VOICE_IDS.includes(raw.voice as VoiceId) ? (raw.voice as VoiceId) : DEFAULT_PREFS.voice,
  };
}

export function saveRemixPrefs(userId: string, p: RemixPrefs): void {
  try {
    store()?.setItem(KEY + scoped(userId), JSON.stringify(p));
  } catch {
    // full storage: the pick holds for this remix and the next one starts from the default
  }
}

/** The brand kit's name, else the brand's own name unless it is the default 'Me'. */
export function brandName(userId: string): string {
  const kit = loadBrand(userId)?.name.trim();
  const profile = activeProfile(userId).name.trim();
  return kit || (profile && profile !== "Me" ? profile : "your business");
}

/** The make call's brand block. The offer goes only by name, and only with mention on. */
export function brandPack(userId: string, o: { platform: string; mention: boolean; offer: string | null }): BrandPack {
  const kit = loadBrand(userId);
  const p = loadPositioning(userId);
  const offer = o.mention && o.offer && offerNames(userId).includes(o.offer) ? { name: o.offer } : null;
  return {
    name: brandName(userId),
    oneLiner: p?.oneLiner.trim() ?? "",
    audience: [p && p.audience !== "general" ? p.audience.replace(/-/g, " ") : "", p?.audienceDetail.trim()].filter(Boolean).join(": "),
    topics: (p?.topics ?? []).map((t) => t.trim()).filter(Boolean),
    facts: coachContext(loadCoachProfile(userId)),
    mention: o.mention,
    offer,
    rules: brandRulesLine(kit, o.platform),
  };
}

/** The For row's collapsed line: "MoneyBees | your voice | mentions MoneyBees | no offer". */
export function forSummary(a: { brand: string; hasVoice: boolean; mention: boolean; offer: string | null; video: boolean }): string {
  return [
    a.brand,
    a.hasVoice ? "your voice" : "plain voice",
    a.mention ? `mentions ${a.brand}` : "no brand mention",
    (a.mention && a.offer) || "no offer",
    a.video ? "AI presenter" : "",
  ]
    .filter(Boolean)
    .join(" | ");
}
