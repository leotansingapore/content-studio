import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdForm } from "@/lib/adlauncher";

vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "", SUPABASE_ANON_KEY: "", supabase: { functions: { invoke: vi.fn() } } }));

const { keepSheet, readSheet } = await import("./RunAsAdSheet");

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("sessionStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
});
afterEach(() => vi.unstubAllGlobals());

const typed = { headline: "Typed headline", primaryText: "Typed text", approval: "AP-9", days: "14" } as AdForm;

describe("the kept sheet", () => {
  it("keeps the typed headline and text while the design's words are the same", () => {
    keepSheet("img-1", typed, ["Old words", "Old caption"]);
    expect(readSheet("img-1", ["Old words", "Old caption"])).toEqual(typed);
  });

  it("drops the typed headline and text once the design's words change, and keeps the rest", () => {
    keepSheet("img-1", typed, ["Old words", "Old caption"]);
    expect(readSheet("img-1", ["New words", "Old caption"])).toEqual({ approval: "AP-9", days: "14" });
    expect(readSheet("img-1", ["Old words", "New caption"])).toEqual({ approval: "AP-9", days: "14" });
  });

  it("drops copy kept without its words", () => {
    store.set("cs-ad-sheet-img-1", JSON.stringify({ headline: "Kept before", primaryText: "Kept before", approval: "AP-1" }));
    expect(readSheet("img-1", ["New words", ""])).toEqual({ approval: "AP-1" });
  });

  it("forgets the sheet on Create or Cancel", () => {
    keepSheet("img-1", typed, ["Old words", "Old caption"]);
    keepSheet("img-1", null);
    expect(readSheet("img-1", ["Old words", "Old caption"])).toBeNull();
  });
});
