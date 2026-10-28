// /generate/answer: every field opens from the URL, and nothing can be written until there is a question.
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

import AnswerPage, { splitTitle } from "./AnswerPage";

const html = (path = "/generate/answer") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(AnswerPage)));
const button = (h: string) => /<button[^>]*>(?:(?!<\/button>).)*Write 3 answers<\/button>/s.exec(h)?.[0] ?? "";

describe("Answer a question", () => {
  it("cannot write until there is a question", () => {
    expect(button(html())).toMatch(/\sdisabled=""/);
  });
  it("opens with the question, the place, the link rule and the length from the URL", () => {
    const h = html("/generate/answer?q=Is%20it%20worth%20it%3F&where=r%2FSGExams&rule=links%20only%20if%20asked&shape=guide");
    expect(h).toContain(">Is it worth it?</textarea>");
    expect(h).toContain('value="r/SGExams"');
    expect(h).toContain('value="links only if asked"');
    expect(h).toMatch(/value="guide"[^>]*data-state="checked"|data-state="checked"[^>]*value="guide"/);
    expect(button(h)).not.toMatch(/\sdisabled=""/);
  });
  it("says the user posts it themselves", () => {
    expect(html()).toContain("You post it yourself. Nothing is sent from here.");
  });
});

describe("splitTitle", () => {
  it("splits a guide's TITLE line from its body, and leaves a reply whole", () => {
    expect(splitTitle("TITLE: How finance internships work\n\nStart here.\nThen this.")).toEqual({ title: "How finance internships work", body: "Start here.\nThen this." });
    expect(splitTitle("Yes, if you start early.")).toEqual({ title: null, body: "Yes, if you start early." });
  });
});
