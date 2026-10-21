// What you sell (brand-products, Leo only): the brand's products or services, synced per brand under
// content-studio-products-<scoped>. Pictures are cimg- keys on this device (IndexedDB, also in Media's "Products"
// folder); sources[i] is the site address pictures[i] came from ("" for one uploaded or picked from Media), so
// another device fetches it again under the same key. Offers stay their own list and remain the only allowed links.

import { offerUrl } from "@/lib/brandRules";
import { scoped } from "@/lib/profiles";
import { NAMED_AT, type ScannedProduct } from "../../supabase/functions/brand-dna/logic.ts";

export const MAX_PRODUCTS = 24;
export const MAX_PICTURES = 4;
export const LIMITS = { name: 60, what: 200, forWho: 120, price: 40, url: 300, generic: 120 } as const;
export const PRODUCTS_CHANGED = "content-studio-products-changed";
const PREFIX = "content-studio-products-";
const ID = /^pd-[a-z0-9]{4,30}$/;
const PICTURE = /^cimg-[a-z0-9]{6,30}$/;

export type ProductKind = "products" | "service";

export interface Product {
  id: string;
  name: string;
  what: string;
  forWho: string;
  price?: string;
  url?: string;
  /** cimg- keys, the first used first. */
  pictures: string[];
  /** The site address of each picture, "" for one with none. */
  sources: string[];
  /** The general kind, with no brand or insurer names: what briefs say in place of a named product. */
  generic?: string;
  namedProduct?: boolean;
  /** "Use in posts". */
  use: boolean;
  from: "website" | "you";
  addedAt: string;
}

export interface Products {
  /** Unset until a scan picks it or the toggle is pressed; reads "service" (most advisers sell advice). */
  kind?: ProductKind;
  /** The origin last scanned. */
  site?: string;
  readAt?: string;
  items: Product[];
}

export const EMPTY: Products = { items: [] };
export const kindOf = (p: Products): ProductKind => p.kind ?? "service";
export const newProductId = () => `pd-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const httpUrl = (v: unknown, max: number) => {
  const t = text(v, max + 1);
  if (!t || t.length > max) return "";
  try {
    return /^https?:$/.test(new URL(t).protocol) ? t : "";
  } catch {
    return "";
  }
};

/** One stored item as the app reads it, or null when it has no id or no name. */
export function sanitizeProduct(raw: unknown): Product | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" && ID.test(r.id) ? r.id : "";
  const name = text(r.name, LIMITS.name);
  if (!id || !name) return null;
  const price = text(r.price, LIMITS.price);
  const url = typeof r.url === "string" && offerUrl(r.url) && r.url.trim().length <= LIMITS.url ? (offerUrl(r.url) as string) : "";
  const generic = text(r.generic, LIMITS.generic);
  const pics = Array.isArray(r.pictures) ? r.pictures : [];
  const srcs = Array.isArray(r.sources) ? r.sources : [];
  // pictures and their sources stay paired; a bad key drops its pair, a bad source keeps the picture with none
  const pairs = pics.flatMap((k, i) => (typeof k === "string" && PICTURE.test(k) ? [[k, httpUrl(srcs[i], 1000)] as const] : []))
    .filter(([k], i, all) => all.findIndex(([x]) => x === k) === i)
    .slice(0, MAX_PICTURES);
  return {
    id,
    name,
    what: text(r.what, LIMITS.what),
    forWho: text(r.forWho, LIMITS.forWho),
    ...(price ? { price } : {}),
    ...(url ? { url } : {}),
    pictures: pairs.map(([k]) => k),
    sources: pairs.map(([, s]) => s),
    ...(generic ? { generic } : {}),
    ...(r.namedProduct === true ? { namedProduct: true } : {}),
    use: r.use !== false,
    from: r.from === "website" ? "website" : "you",
    addedAt: text(r.addedAt, 40),
  };
}

export function sanitizeProducts(raw: unknown): Products {
  if (!raw || typeof raw !== "object") return { items: [] };
  const r = raw as Record<string, unknown>;
  const items: Product[] = [];
  for (const it of Array.isArray(r.items) ? r.items : []) {
    const p = sanitizeProduct(it);
    if (p && items.length < MAX_PRODUCTS && !items.some((x) => x.id === p.id)) items.push(p);
  }
  const site = httpUrl(r.site, 200);
  const readAt = text(r.readAt, 40);
  return {
    ...(r.kind === "products" || r.kind === "service" ? { kind: r.kind } : {}),
    ...(site ? { site } : {}),
    ...(readAt ? { readAt } : {}),
    items,
  };
}

export const productsKey = (userId: string) => PREFIX + scoped(userId);

export function loadProducts(userId: string | null | undefined): Products {
  if (!userId) return { items: [] };
  try {
    return sanitizeProducts(JSON.parse(localStorage.getItem(productsKey(userId)) ?? "null"));
  } catch {
    return { items: [] };
  }
}

/** Saves the list; null when it saved, else the line to show (nothing is written). */
export function saveProducts(userId: string, p: Products): string | null {
  try {
    localStorage.setItem(productsKey(userId), JSON.stringify(sanitizeProducts(p)));
  } catch {
    return "This device is out of room, so that wasn't saved. Clear some space, then try again.";
  }
  window.dispatchEvent(new Event(PRODUCTS_CHANGED));
  return null;
}

/** What posts and videos call it: the general kind for a named insurer product, else its name. */
export const productLabel = (p: Pick<Product, "name" | "generic" | "namedProduct">) => (p.namedProduct && p.generic ? p.generic : p.name);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The brief Write gets for "Write a post about it": a named product is described only in general terms. */
export function productBrief(p: Product): string {
  const label = productLabel(p);
  // the page's own sentence may repeat the plan name: it reads the general kind there too
  const plain = (s: string) => (p.namedProduct && p.generic ? s.replace(new RegExp(escape(p.name), "gi"), p.generic) : s);
  return [
    `Write a post about what I offer: ${label}.`,
    p.what && `What it is: ${plain(p.what)}`,
    p.forWho && `Who it's for: ${plain(p.forWho)}`,
    p.price && `Price: ${p.price}`,
    p.namedProduct && "Describe it in general terms. Never name the plan, the insurer or the fund house.",
  ].filter(Boolean).join("\n");
}

/** The product remixes use first: the first one with "Use in posts" on. */
export const mainProduct = (list: Product[]): Product | null => list.find((p) => p.use) ?? null;

const sameUrl = (a: string, b: string) => a.replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase() === b.replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();

/**
 * The saved item a found row is already in: the same name (any case), or the same page when that page is the row's
 * own (a services page listing five services would otherwise mark all five as added once one was).
 */
export function alreadyAdded(items: Product[], row: Pick<ScannedProduct, "name" | "url">, rows: Pick<ScannedProduct, "url">[] = []): Product | undefined {
  const name = row.name.trim().toLowerCase();
  const ownPage = !!row.url && rows.filter((r) => r.url && sameUrl(r.url, row.url!)).length <= 1;
  return items.find((p) => p.name.trim().toLowerCase() === name || (ownPage && !!p.url && sameUrl(p.url, row.url!)));
}

/** A scan's answer, as brand-dna products sends it. */
export interface Scan {
  site: string;
  readAt: string;
  pagesRead: string[];
  kind: ProductKind | null;
  items: ScannedProduct[];
}

/**
 * The ticked rows added to the list, skipping any already in it and stopping at MAX_PRODUCTS. Saved items are never
 * changed, so the person's edits stay. A row's picture takes the key it was fetched under in the review, or a new
 * key that this device or another fetches from its source later. The kind is set only when none was picked.
 */
export function mergeScan(list: Products, scan: Scan, ticked: number[], fetched: Record<string, string> = {}, now = new Date()): { next: Products; added: Product[] } {
  const added: Product[] = [];
  const room = MAX_PRODUCTS - list.items.length;
  scan.items.forEach((row, i) => {
    if (!ticked.includes(i) || added.length >= room || alreadyAdded([...list.items, ...added], row, scan.items)) return;
    const key = row.picture ? (PICTURE.test(fetched[row.picture] ?? "") ? fetched[row.picture] : `cimg-${newProductId().slice(3)}${i.toString(36)}`) : "";
    added.push({
      id: newProductId() + i.toString(36),
      name: row.name.trim().slice(0, LIMITS.name),
      what: row.what.trim().slice(0, LIMITS.what),
      forWho: row.forWho.trim().slice(0, LIMITS.forWho),
      ...(row.price ? { price: row.price.slice(0, LIMITS.price) } : {}),
      ...(row.url ? { url: row.url } : {}),
      pictures: key ? [key] : [],
      sources: key ? [row.picture!] : [],
      ...(row.generic ? { generic: row.generic.slice(0, LIMITS.generic) } : {}),
      ...(row.namedP !== null && row.namedP >= NAMED_AT ? { namedProduct: true } : {}),
      use: true,
      from: "website",
      addedAt: now.toISOString(),
    });
  });
  return {
    next: { ...list, ...(list.kind ? {} : scan.kind ? { kind: scan.kind } : {}), site: scan.site, readAt: scan.readAt, items: [...list.items, ...added] },
    added,
  };
}
