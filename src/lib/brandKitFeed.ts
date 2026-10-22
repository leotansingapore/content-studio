// A brand kit published by the brand's own site (tiny-word-hive docs/north-star/items/ig-kit.md; Leo, 21 Oct: "this
// should probably be synced with content-studio-beige-eta.vercel.app"). MoneyBees serves one kit.json from
// themoneybees.co; a profile linked to that board brand takes its colours and logo from it instead of its own copy.
//
// The cache is a device hint (cs- prefix, outside cloudSync's content-studio- prefix): it never syncs, so it never
// races a synced copy, and only Leo's sessions ever write it (BrandPage and CarouselPage refresh it for Leo only).
import { MAX_PALETTE, normalizeHex, sanitizeImage, type CarouselBrand } from "@/lib/carousel";

/** Board brand -> its kit feed, keyed like IG_HANDLES in reelsBoard.ts. */
export const KIT_FEEDS: Record<string, string> = {
  moneybees: "https://themoneybees.co/brand-kit/kit.json",
};
export const KIT_KEY_PREFIX = "cs-brand-feed-";
const DAY_MS = 24 * 3600e3;

export interface BrandKit {
  version: string;
  built: string;
  colors: Record<string, string>;
  roles: { primary: string; accents: string[] };
  logo?: string;
}
export interface CachedKit {
  kit: BrandKit;
  /** The lockup as a data URL, fetched once per kit version. */
  logo?: string;
  fetchedAt: string;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Schema 1 only; colours through normalizeHex, links kept only when https on the feed's own origin. Null when unusable. */
export function sanitizeKit(raw: unknown, feed: string): BrandKit | null {
  const r = obj(raw);
  if (r.schema !== 1 || typeof r.version !== "string" || !/^[0-9a-f]{12}$/.test(r.version)) return null;
  const origin = new URL(feed).origin;
  const ours = (u: unknown) => {
    try {
      const url = new URL(String(u));
      return url.protocol === "https:" && url.origin === origin ? url.href : undefined;
    } catch {
      return undefined;
    }
  };
  const colors: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(r.colors))) {
    const hex = typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v) ? normalizeHex(v) : null;
    if (hex && /^[a-z]{1,20}$/.test(k)) colors[k] = hex;
  }
  const roles = obj(r.roles);
  const primary = typeof roles.primary === "string" && colors[roles.primary] ? roles.primary : "";
  if (!primary) return null;
  const accents = (Array.isArray(roles.accents) ? roles.accents : []).filter((a): a is string => typeof a === "string" && !!colors[a] && a !== primary);
  return {
    version: r.version,
    built: typeof r.built === "string" ? r.built.slice(0, 30) : "",
    colors,
    roles: { primary, accents: [...new Set(accents)].slice(0, MAX_PALETTE) },
    logo: ours(obj(r.logos).lockup),
  };
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The kit this device last read for a board brand, or null. */
export function cachedKit(boardBrand: string | undefined): CachedKit | null {
  const feed = boardBrand ? KIT_FEEDS[boardBrand] : undefined;
  if (!feed) return null;
  try {
    const c = obj(JSON.parse(storage()?.getItem(KIT_KEY_PREFIX + boardBrand) ?? "null"));
    const kit = sanitizeKit({ schema: 1, ...obj(c.kit), logos: { lockup: obj(c.kit).logo } }, feed);
    return kit && typeof c.fetchedAt === "string" ? { kit, logo: sanitizeImage(c.logo), fetchedAt: c.fetchedAt } : null;
  } catch {
    return null;
  }
}

/** A fetched picture as a data URL, kept only when sanitizeImage takes it (a PNG, JPEG or WebP under the size cap). */
async function dataUrl(res: Response): Promise<string | undefined> {
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return sanitizeImage(`data:${type};base64,${btoa(bin)}`);
}

export interface KitRefresh {
  cache: CachedKit | null;
  /** False when the site could not be read (the cache, if any, is what shows). */
  ok: boolean;
}

/** Fetch the kit when the cache is over a day old, or on force (the Refresh button). A failed fetch keeps the cache. */
export async function refreshKit(boardBrand: string | undefined, { force = false, fetcher = fetch, now = Date.now() } = {}): Promise<KitRefresh> {
  const feed = boardBrand ? KIT_FEEDS[boardBrand] : undefined;
  const cache = cachedKit(boardBrand);
  if (!feed) return { cache: null, ok: true };
  if (!force && cache && now - Date.parse(cache.fetchedAt) < DAY_MS) return { cache, ok: true };
  try {
    const res = await fetcher(feed, { cache: "no-cache" });
    if (!res.ok) throw new Error(`kit ${res.status}`);
    const kit = sanitizeKit(await res.json(), feed);
    if (!kit) throw new Error("kit schema");                       // a schema this reader doesn't know: keep the old copy
    let logo = cache?.kit.version === kit.version ? cache.logo : undefined;
    if (!logo && kit.logo) {
      const img = await fetcher(`${kit.logo}?v=${kit.version}`);
      logo = img.ok ? await dataUrl(img) : undefined;
    }
    const next: CachedKit = { kit, logo, fetchedAt: new Date(now).toISOString() };
    storage()?.setItem(KIT_KEY_PREFIX + boardBrand, JSON.stringify(next));
    return { cache: next, ok: true };
  } catch {
    return { cache, ok: false };
  }
}

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The brand with the kit's colour, accents and logo; every other field is the saved one. */
export function withKit(brand: CarouselBrand, cached: CachedKit): CarouselBrand {
  const { colors, roles } = cached.kit;
  return {
    ...brand,
    color: colors[roles.primary],
    palette: roles.accents.map((a) => ({ name: title(a), hex: colors[a] })),
    logo: cached.logo ?? brand.logo,
  };
}
