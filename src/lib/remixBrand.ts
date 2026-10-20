// What a remix wears (docs/north-star/items/remix-your-brand.md): the switches the sheet's For row remembers per
// brand, and the one brand block each make call carries, built from the brand kit, positioning and the coach
// profile of the brand open now.

import { brandOffers, brandRulesLine } from "@/lib/brandRules";
import { loadBrand } from "@/lib/carousel";
import { coachContext, loadCoachProfile } from "@/lib/coachProfile";
import { loadPositioning } from "@/lib/positioning";
import { DEFAULT_PROFILE_ID, activeProfile, activeProfileId, scoped } from "@/lib/profiles";
import { VOICE_IDS, type VoiceId } from "@/lib/textVoice";
import type { BrandPack, Speaker } from "../../supabase/functions/remix/logic.ts";

export interface RemixPrefs {
  mention: boolean;
  /** The offer's name, from the brand kit. */
  offer: string | null;
  /** 'new' makes an AI presenter; a presenter id later. 'mine' waits for people-my-face. */
  face: "new" | string;
  /** 'mine' waits for people-my-voice. */
  voice: VoiceId;
  /** Only once picked in the For row; until then speakerFor(kit) decides. */
  speaker?: Speaker;
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
    ...(raw.speaker === "person" || raw.speaker === "business" ? { speaker: raw.speaker } : {}),
  };
}

/**
 * The account's own brand is the person; an added brand (/brands/new reads it from a website) is a business, unless
 * its kit's You fields hold a role or a headshot, which only a person has.
 */
export function speakerFor(userId: string): Speaker {
  if (activeProfileId(userId) === DEFAULT_PROFILE_ID) return "person";
  const kit = loadBrand(userId);
  return kit?.role?.trim() || kit?.photo ? "person" : "business";
}

export function saveRemixPrefs(userId: string, p: RemixPrefs): void {
  try {
    store()?.setItem(KEY + scoped(userId), JSON.stringify(p));
  } catch {
    // full storage: the pick holds for this remix and the next one starts from the default
  }
}

/** The brand kit's name, else the brand's own name unless it is the default 'Me'; '' when there is neither. */
export function ownBrandName(userId: string): string {
  const kit = loadBrand(userId)?.name.trim();
  const profile = activeProfile(userId).name.trim();
  return kit || (profile && profile !== "Me" ? profile : "");
}

/** For the sheet's copy only; the prompt never gets "your business" as a name. */
export const brandName = (userId: string) => ownBrandName(userId) || "your business";

/** The make call's brand block. The offer goes only by name, and only with mention on and a real name to mention. */
export function brandPack(userId: string, o: { platform: string; mention: boolean; offer: string | null; speaker?: Speaker }): BrandPack {
  const kit = loadBrand(userId);
  const p = loadPositioning(userId);
  const name = ownBrandName(userId);
  const mention = o.mention && name !== "";
  const offer = mention && o.offer && offerNames(userId).includes(o.offer) ? { name: o.offer } : null;
  return {
    name,
    oneLiner: p?.oneLiner.trim() ?? "",
    audience: [p && p.audience !== "general" ? p.audience.replace(/-/g, " ") : "", p?.audienceDetail.trim()].filter(Boolean).join(": "),
    topics: (p?.topics ?? []).map((t) => t.trim()).filter(Boolean),
    facts: coachContext(loadCoachProfile(userId)),
    mention,
    offer,
    rules: brandRulesLine(kit, o.platform),
    speaker: o.speaker ?? speakerFor(userId),
  };
}

/** The For row's collapsed line: "MoneyBees | as you | your voice | mentions MoneyBees | no offer". `video`: an AI presenter speaks it. */
export function forSummary(a: { brand: string; speaker: Speaker; hasVoice: boolean; mention: boolean; offer: string | null; video: boolean }): string {
  return [
    a.brand,
    a.speaker === "business" ? "as the business" : "as you",
    a.hasVoice ? "your voice" : "plain voice",
    a.mention ? `mentions ${a.brand}` : "no brand mention",
    (a.mention && a.offer) || "no offer",
    a.video ? "AI presenter" : "",
  ]
    .filter(Boolean)
    .join(" | ");
}
