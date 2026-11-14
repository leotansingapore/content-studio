// What Profile's in-place rows save (ProfileRows.tsx), each to the store its own page saves to, read fresh and merged
// so a save here never undoes one made on Brand kit, Plan or Products: the brand kit (carousel.ts), the positioning,
// the main product and the script product card.

import { DEFAULT_BRAND, loadBrand, normalizeHandle, saveBrand, type CarouselBrand } from "@/lib/carousel";
import { EMPTY_POSITIONING, loadPositioning, parseTopics, savePositioning, type Positioning } from "@/lib/positioning";
import { loadProducts, mainProduct, saveProducts } from "@/lib/products";
import { loadScriptContext, saveScriptContext } from "@/lib/scriptContext";
import { loadSocialAccounts } from "@/lib/socialAccounts";

export const NO_ROOM = "This device is out of room, so that wasn't saved. Clear some space, then try again.";

export type ProfileField = "name" | "oneLiner" | "profession" | "country" | "niche" | "edge" | "who" | "topics" | "price" | "proof" | "avoid" | "signoff" | "logo" | "color" | "offerName" | "offerUrl";

/** The kit as the brand kit page starts it: the saved one, else a new one with the handle of a connected account. */
export function kitOf(uid: string): CarouselBrand {
  const saved = loadBrand(uid);
  if (saved) return saved;
  const accounts = loadSocialAccounts(uid);
  return { ...DEFAULT_BRAND, handle: normalizeHandle(accounts.instagram?.handle ?? accounts.tiktok?.handle ?? "") };
}

const kit = (uid: string, patch: Partial<CarouselBrand>): string | null => {
  saveBrand(uid, { ...kitOf(uid), ...patch });
  return null;
};
/** The brand kit's first offer, started when there is none; any others stay as they are. */
const firstOffer = (uid: string, patch: Partial<{ name: string; url: string }>): string | null => {
  const [first = { name: "", url: "" }, ...rest] = kitOf(uid).offers ?? [];
  return kit(uid, { offers: [{ ...first, ...patch }, ...rest] });
};
const positioning = (uid: string, patch: Partial<Positioning>): string | null => {
  try {
    savePositioning(uid, { ...(loadPositioning(uid) ?? EMPTY_POSITIONING), ...patch });
    return null;
  } catch {
    return NO_ROOM;
  }
};

/** Saves one field; null when it saved, else the line to show. `value` is the text typed (a data URL or hex for logo and colour). */
export function saveProfileField(uid: string, field: ProfileField, value: string): string | null {
  switch (field) {
    case "name":
      return kit(uid, { name: value });
    case "profession":
      return kit(uid, { profession: value });
    case "country":
      return kit(uid, { country: value });
    case "niche":
      return kit(uid, { niche: value });
    case "avoid":
      return kit(uid, { avoidWords: value });
    case "signoff":
      return kit(uid, { signOff: value });
    case "logo":
      return kit(uid, { logo: value || undefined });
    case "color":
      return kit(uid, { color: value });
    case "offerName":
      return firstOffer(uid, { name: value });
    case "offerUrl":
      return firstOffer(uid, { url: value });
    case "oneLiner":
      return positioning(uid, { oneLiner: value });
    case "edge":
      return positioning(uid, { edge: value });
    case "who":
      return positioning(uid, { audienceDetail: value });
    case "topics":
      return positioning(uid, { topics: parseTopics(value) });
    case "price": {
      const now = loadProducts(uid);
      const main = mainProduct(now.items);
      if (!main) return "Add a product first.";
      return saveProducts(uid, { ...now, items: now.items.map((p) => (p.id === main.id ? { ...p, price: value } : p)) });
    }
    case "proof":
      return saveScriptContext(uid, { product: { ...loadScriptContext(uid).product, proof: value } }) ? null : NO_ROOM;
  }
}
