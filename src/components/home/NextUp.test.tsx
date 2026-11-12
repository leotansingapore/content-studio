// Next up on every sign-in's Home since 12 Nov: Fastlane's header (Next up, its count, View all), the first item's first
// button the page's one filled button, and the agent engine kept out of everyone else's Home.
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { DraftEntry } from "@/lib/draftHistory";
import type { NextUpItem } from "@/lib/needsYou";

vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", supabase: {} }));

import NextUp from "./NextUp";

const html = (shape: (i: NextUpItem[]) => NextUpItem[], drafts: DraftEntry[] = [], path = "/home") =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <NextUp userId="u1" today="2026-11-12" usage={null} markPosted={() => undefined} blocked={() => null} input={{ drafts }} shape={shape} />
    </MemoryRouter>,
  ).replace(/&amp;/g, "&");
const item = (id: string): NextUpItem => ({ id, kind: "setup", title: `Item ${id}`, actions: [{ label: `Go ${id}`, to: `/${id}` }] });
const FILLED = /<a[^>]*class="[^"]*\bbg-primary text-primary-foreground[^"]*"[^>]*href="([^"]+)"|<a[^>]*href="([^"]+)"[^>]*class="[^"]*\bbg-primary text-primary-foreground/g;

describe("Next up", () => {
  it("heads the list with Next up and its count, and fills only the first item's first button", () => {
    const out = html(() => [item("a"), item("b"), item("c"), item("d")]);
    expect(out).toMatch(/<h2 id="next-up-label"[^>]*>Next up<span[^>]*>4<\/span><\/h2>/);
    expect([...out.matchAll(FILLED)].map((m) => m[1] ?? m[2])).toEqual(["/a"]);
    expect(out).toContain(">Item b<");
    expect(out).toContain(">Item c<");
    // the fourth waits behind View all, at the top right as Fastlane's
    expect(out).not.toContain(">Item d<");
    expect(out).toContain("View all 4");
  });

  it("lists them all on ?waiting=all, and says so when nothing waits", () => {
    expect(html(() => [item("a"), item("b"), item("c"), item("d")], [], "/home?waiting=all")).toContain(">Item d<");
    const empty = html(() => []);
    expect(empty).toContain("Nothing needs you right now.");
    expect(empty).not.toContain("View all");
  });

  it("never imports the agent engine itself: a waiting card's Approve is its own chunk", () => {
    const src = readFileSync("src/components/home/NextUp.tsx", "utf8");
    expect(src).not.toMatch(/from "@\/lib\/agentRun"|from "@\/lib\/agentBudget"/);
    expect(src).toContain('lazy(() => import("@/components/home/NextUpDecide"))');
    expect(readFileSync("src/components/home/NextUpDecide.tsx", "utf8")).toMatch(/from "@\/lib\/agentRun"/);
  });
});
