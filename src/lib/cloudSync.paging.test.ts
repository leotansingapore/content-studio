// The whole-account read past PostgREST's 1,000 rows (max_rows): every row comes back, a page at a time.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncRow } from "./cloudSync";

const ME = "11111111-1111-4111-8111-111111111111";
let rows: SyncRow[] = [];
let failAfter: string | null = null;
const asked: string[] = [];

// PostgREST as the client sees it: filters, then order and limit, never more than 1,000 rows, any order unless asked
function builder() {
  let after: string | null = null;
  let like: string[] | null = null;
  let ordered = false;
  let limit = Infinity;
  const b = {
    select: () => b,
    eq: () => b,
    gt: (_c: string, v: string) => ((after = v), b),
    or: (s: string) => ((like = s.split(",").map((x) => x.replace(/^key\.like\./, "").replace(/\*$/, ""))), b),
    order: () => ((ordered = true), b),
    limit: (n: number) => ((limit = n), b),
    then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
      asked.push(after ?? "");
      if (failAfter !== null && after === failAfter) return Promise.resolve({ data: null, error: { message: "timeout" } }).then(ok, bad);
      let out = rows.filter((r) => (after === null || r.key > after) && (!like || like.some((p) => r.key.startsWith(p))));
      out = ordered ? [...out].sort((x, y) => x.key.localeCompare(y.key)) : [...out].reverse();
      return Promise.resolve({ data: out.slice(0, Math.min(limit, 1000)), error: null }).then(ok, bad);
    },
  };
  return b;
}
vi.mock("@/lib/supabase", () => ({ supabase: { from: () => builder() } }));

const { supabaseBackend } = await import("./cloudSync");
const row = (k: number, name = "posts"): SyncRow => ({ key: `content-studio-${name}-${ME}~b${String(k).padStart(4, "0")}`, data: "{}", updated_at: "2026-11-13T00:00:00.000Z" });

beforeEach(() => {
  rows = [];
  failAfter = null;
  asked.length = 0;
});

describe("the sync pull past 1,000 rows", () => {
  it("reads every row of an account of 2,345 rows, three pages in key order", async () => {
    rows = Array.from({ length: 2345 }, (_, k) => row(k));
    const { data, error } = await supabaseBackend(ME).pull();
    expect(error).toBeNull();
    expect(data).toHaveLength(2345);
    expect(new Set(data!.map((r) => r.key)).size).toBe(2345);
    expect(asked).toHaveLength(3);
  });

  it("asks once when the account fits one page, and again only after a full one", async () => {
    rows = Array.from({ length: 1000 }, (_, k) => row(k));
    expect((await supabaseBackend(ME).pull()).data).toHaveLength(1000);
    expect(asked).toHaveLength(2); // a full page could hide more: the empty second page ends it
  });

  it("fails the whole pull when a later page fails, never half an account", async () => {
    rows = Array.from({ length: 1500 }, (_, k) => row(k));
    failAfter = row(999).key;
    expect(await supabaseBackend(ME).pull()).toEqual({ data: null, error: { message: "timeout" } });
  });

  it("pages the merged lists' read too", async () => {
    rows = [...Array.from({ length: 1200 }, (_, k) => row(k, "drafts")), ...Array.from({ length: 50 }, (_, k) => row(k, "voice"))];
    const { data } = await supabaseBackend(ME).pullLike!(["content-studio-drafts-"]);
    expect(data).toHaveLength(1200);
  });
});
