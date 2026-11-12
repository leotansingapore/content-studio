import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "", SUPABASE_ANON_KEY: "", supabase: { auth: { getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) }, functions: { invoke: vi.fn() }, from: vi.fn() } }));

import { shownSources } from "./IdeasPage";

describe("the From chips on /ideas", () => {
  const SOURCES = ["dump", "posts", "market", "news"] as const;
  const counts: Record<string, number> = { dump: 0, posts: 0, market: 3, news: 0 };
  it("shows All and the sources with ideas, plus the one picked and one still loading", () => {
    expect(shownSources(SOURCES, "all", (s) => counts[s], () => false)).toEqual(["all", "market"]);
    expect(shownSources(SOURCES, "news", (s) => counts[s], () => false)).toEqual(["all", "market", "news"]);
    expect(shownSources(SOURCES, "all", (s) => counts[s], (s) => s === "posts")).toEqual(["all", "posts", "market"]);
    expect(shownSources(SOURCES, "all", () => 0, () => false)).toEqual(["all"]);
  });
});
