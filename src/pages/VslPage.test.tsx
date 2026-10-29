// /generate/vsl: every answer opens from the URL, nothing can be written until there is an offer, and a finished
// script's length leaves out its headings and the gaps it marks.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
  };
});
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoOnly: () => false }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

import VslPage, { scriptStats } from "./VslPage";

const html = (path = "/generate/vsl") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(VslPage)));
const button = (h: string) => /<button[^>]*>(?:(?!<\/button>).)*Write 2 versions<\/button>/s.exec(h)?.[0] ?? "";

describe("Write a VSL", () => {
  it("cannot write until there is an offer, even with every other answer filled", () => {
    expect(button(html())).toMatch(/\sdisabled=""/);
    expect(button(html("/generate/vsl?promise=More%20calls&method=Three%20steps&next=Book%20a%20call"))).toMatch(/\sdisabled=""/);
  });
  it("opens with each answer from the URL", () => {
    const h = html("/generate/vsl?offer=Coaching%20for%20new%20managers&objections=Too%20busy&next=Book%20a%20call");
    expect(h).toContain(">Coaching for new managers</textarea>");
    expect(h).toContain(">Too busy</textarea>");
    expect(h).toContain(">Book a call</textarea>");
    expect(button(h)).not.toMatch(/\sdisabled=""/);
  });
  it("asks the seven intake questions, only the first required", () => {
    const h = html();
    for (const label of ["What you sell, and who it&#x27;s for", "What they say on the first call", "Three results you&#x27;d show first", "What stops people buying", "The one next step"]) {
      expect(h).toContain(label);
    }
    expect(h.match(/\(optional\)/g)).toHaveLength(6);
  });
});

describe("scriptStats", () => {
  it("counts spoken words only, at 2.5 words a second, and the [Need: ...] gaps", () => {
    const line = "one two three four five six seven eight nine ten";
    const script = ["INTRO", ...Array(30).fill(line), "[Need: one result with the number]", "", "OBJECTION 1", "P.S.:", line].join("\n");
    expect(scriptStats(script)).toEqual({ words: 310, minutes: 2, needs: 1 });
    expect(scriptStats("Short.")).toEqual({ words: 1, minutes: 1, needs: 0 });
  });
});
