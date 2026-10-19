// Add a brand (/brands/new): what a site read gives back, and the half-done form kept for the tab so
// leaving the page or reloading does not throw away the read and the cards already checked.
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
}

export interface KeptBrand {
  address: string;
  name: string;
  justName: boolean;
  dna: BrandDna | null;
  done: string[];
}

// sessionStorage, outside the synced prefix: nothing is saved until Create
export const keptBrandKey = (userId: string) => `cs-addbrand-form-${userId}`;

const isDna = (d: unknown): d is BrandDna => {
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
      dna: isDna(f.dna) ? f.dna : null,
      done: Array.isArray(f.done) ? f.done.filter((c: unknown): c is string => typeof c === "string" && cards.includes(c)) : [],
    };
    return kept.address || kept.name || kept.dna ? kept : null;
  } catch {
    return null;
  }
}
