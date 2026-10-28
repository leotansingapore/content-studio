// Add a brand (/brands/new): what a site read gives back, and the half-done form kept for the tab so
// leaving the page or reloading does not throw away the read and the cards already checked.
import { DEFAULT_BRAND, type CarouselBrand } from "@/lib/carousel";
import type { PlanAudience } from "@/lib/positioning";
import type { SocialPlatform } from "@/lib/socialAccounts";

export interface BrandDna {
  url: string;
  name: string;
  colour: string | null;
  logo: string | null;
  handles: Partial<Record<SocialPlatform, string>>;
  oneLiner: string;
  audience: PlanAudience;
  audienceDetail: string;
  topics: string[];
  edge: string;
  voice: string;
  /** When Leo's deep read came back (brand-from-website); everyone else's read has none. */
  readAt?: string;
}

export const AUDIENCE_NAMES: Record<PlanAudience, string> = {
  "young-adult": "Young adults",
  "working-adult": "Working adults",
  parent: "Parents",
  "pre-retiree": "Pre-retirees",
  general: "Everyone",
};
/** The handles a read finds, and the address each is saved as. */
export const NETWORKS: { key: SocialPlatform; label: string; base: string }[] = [
  { key: "instagram", label: "Instagram", base: "https://www.instagram.com/" },
  { key: "facebook", label: "Facebook", base: "https://www.facebook.com/" },
  { key: "linkedin", label: "LinkedIn", base: "https://www.linkedin.com/" },
  { key: "tiktok", label: "TikTok", base: "https://www.tiktok.com/@" },
];

export interface KeptBrand {
  address: string;
  name: string;
  justName: boolean;
  /** What the person picked or typed for "What do you do?". */
  profession: string;
  dna: BrandDna | null;
  done: string[];
}

// sessionStorage, outside the synced prefix: nothing is saved until Create
export const keptBrandKey = (userId: string) => `cs-addbrand-form-${userId}`;

export const isDna = (d: unknown): d is BrandDna => {
  if (!d || typeof d !== "object") return false;
  const x = d as Record<string, unknown>;
  const str = (k: string) => typeof x[k] === "string";
  const strOrNull = (k: string) => x[k] === null || typeof x[k] === "string";
  return (
    ["url", "name", "oneLiner", "audience", "audienceDetail", "edge", "voice"].every(str) &&
    strOrNull("colour") &&
    strOrNull("logo") &&
    !!x.handles &&
    typeof x.handles === "object" &&
    Array.isArray(x.topics) &&
    x.topics.every((t) => typeof t === "string")
  );
};

/** The form left open in this tab (read back as text), or null when there is nothing worth putting back. */
export function keptBrand(raw: string | null, cards: readonly string[]): KeptBrand | null {
  try {
    const f = JSON.parse(raw ?? "null");
    if (!f || typeof f !== "object") return null;
    const kept: KeptBrand = {
      address: typeof f.address === "string" ? f.address : "",
      name: typeof f.name === "string" ? f.name : "",
      justName: f.justName === true,
      profession: typeof f.profession === "string" ? f.profession : "",
      dna: isDna(f.dna) ? f.dna : null,
      done: Array.isArray(f.done) ? f.done.filter((c: unknown): c is string => typeof c === "string" && cards.includes(c)) : [],
    };
    return kept.address || kept.name || kept.profession || kept.dna ? kept : null;
  } catch {
    return null;
  }
}

/** What /brands/new sends brand-dna: Leo's sign-in also reads up to 4 more pages (brand-from-website). */
export const readBody = (address: string, leo = false) => (leo ? { url: address, deep: true } : { url: address });

/** The new brand's kit from the confirmed read, as /brands/new saves it. */
export function newBrandKit(brand: BrandDna, title: string): CarouselBrand {
  const ig = brand.handles.instagram?.replace(/^@/, "") ?? "";
  return {
    ...DEFAULT_BRAND,
    name: title,
    handle: ig ? `@${ig}` : "",
    ...(brand.colour ? { color: brand.colour } : {}),
    ...(brand.logo ? { logo: brand.logo } : {}),
    ...(ig ? { instagram: ig } : {}),
    ...(brand.handles.facebook ? { facebook: brand.handles.facebook } : {}),
    // only Leo's reads carry readAt: the site and when it was read, so /brand#website opens on "read <date>"
    ...(brand.readAt ? { website: brand.url, websiteReadAt: brand.readAt } : {}),
  };
}
