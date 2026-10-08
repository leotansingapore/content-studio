// Free stock photos and B-roll from Pexels, through the stock-media edge
// function (the key stays on the server). Results are remembered for this
// visit, so going back to a search costs nothing.

import { callFn } from "@/lib/edgeFn";
import type { Orientation, StockItem, StockKind } from "../../supabase/functions/stock-media/logic.ts";

export type { StockItem };

const seen = new Map<string, { items: StockItem[]; more: boolean }>();

export async function searchStock(kind: StockKind, query: string, page = 1, orientation?: Orientation): Promise<{ items: StockItem[]; more: boolean }> {
  const key = `${kind}|${orientation ?? ""}|${page}|${query.trim().toLowerCase()}`;
  const hit = seen.get(key);
  if (hit) return hit;
  const res = await callFn<{ items: StockItem[]; more: boolean }>("stock-media", { kind, query, page, orientation }, "Couldn't search right now. Try again in a minute.");
  const out = { items: Array.isArray(res?.items) ? res.items : [], more: !!res?.more };
  seen.set(key, out);
  return out;
}

/** The chosen file, fetched straight from Pexels (it allows any site to). */
export async function downloadStock(url: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Couldn't download it. Check your connection and try again.");
  }
  if (!res.ok) throw new Error("Couldn't download it. Try another one.");
  return res.blob();
}
