// The editor serves everyone. Rendered to markup in node (no effects run, so the video is "loading"): a project
// without an AI mark draws exactly as it did before people-dub-lipsync's Script card, for Leo and everyone else, and
// with ?script=1&lang=zh in the address; a project with a mark draws as before for everyone else (sha256 of the
// markup, pinned on today's code at ca211072).
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })), getUser: vi.fn(async () => ({ data: { user: null } })), onAuthStateChange: () => ({}) }, functions: { invoke: vi.fn() }, from: vi.fn() },
}));
vi.mock("@/lib/useLeoOnly", () => ({ useLeoUser: () => null, useLeoOnly: () => false }));

const { Editor, Start } = await import("./VideoEditPage");
const { defaultSettings } = await import("@/lib/videoEdit");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const plain = {
  id: "v1", name: "Clip", createdAt: "2026-10-21T00:00:00.000Z", updatedAt: "", duration: 12, size: 1000,
  words: [{ w: "Most", s: 0, e: 0.4 }, { w: "people", s: 0.4, e: 0.9 }, { w: "plan.", s: 5, e: 5.6 }], settings: defaultSettings("bold"), thumb: "",
};
const marked = {
  ...plain,
  ai: {
    kind: "avatar" as const, person: "presenter" as const, who: "pr-1", voice: "premade" as const, voiceId: "alice" as const, madeAt: "2026-10-21T09:00:00.000Z",
    slices: [{ text: "", start: 0, end: 4.8, clip: "ai-slice-j1-0-0" }, { text: "", start: 4.8, end: 12, clip: "ai-slice-j1-1-0" }],
  },
};
const html = (project: typeof plain, leo: boolean, at = "/edit?p=v1") =>
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [at] }, createElement(Editor, { userId: "u1", leo, project, onSave: () => {}, onOpen: () => {}, onBack: () => {} })));

const PLAIN = "7074e298d92dc25a88686897f9843816caa81d4bf795697570951ea1da3aa345";
const PLAIN_LEO = "78e6d6ed50704ed712474f1d863a2787a4ed611bde261c0631262785a268259e";

describe("the editor for a project the AI didn't make", () => {
  it("draws as before for everyone else and for Leo, with or without ?script and ?lang", () => {
    const everyone = html(plain, false);
    const leo = html(plain, true);
    expect(everyone).toContain("Loading the video...");
    expect(sha(everyone)).toBe(PLAIN);
    expect(sha(leo)).toBe(PLAIN_LEO);
    expect(html(plain, false, "/edit?p=v1&script=1&lang=zh")).toBe(everyone);
    expect(html(plain, true, "/edit?p=v1&script=1&lang=zh")).toBe(leo);
  });

  it("draws an AI video as before for everyone else, Script card params and all", () => {
    expect(html(marked, false)).toBe(html(plain, false));
    expect(html(marked, false, "/edit?p=v1&script=1&lang=zh")).toBe(html(plain, false));
  });
});

describe("Recent on the start screen", () => {
  // a clip found in a 9:05.5 recording (live check 22 Oct): the recording's duration, the clip in its trims
  const clip = { ...plain, id: "v2", name: "Webinar - Follow up the same day", duration: 545.5, settings: { ...defaultSettings("bold"), trimStart: 100, trimEnd: 545.5 - 118.5 } };
  const lengths = (projects: (typeof plain)[]) => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/edit"] }, createElement(Start, { userId: "u1", leo: false, busy: "", projects, onUpload: () => {}, onOpen: () => {}, onRemove: () => {} })));
    return [...markup.matchAll(/<span class="block text-\[11px\] text-muted-foreground">([^<]*)<\/span>/g)].map((m) => m[1]);
  };

  it("shows each project's length", () => {
    expect(lengths([plain, clip])).toEqual(["0:12.0", "9:05.5"]);
  });
});
