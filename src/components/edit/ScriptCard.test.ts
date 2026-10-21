// The Script card's states for Leo, rendered to markup in node (no effects run): who gets it, the closed card, the
// parts with their words, an edited line's price and checks, a red flag, the language review and a face that's gone.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) }, functions: { invoke: vi.fn() }, from: vi.fn() },
}));
const leo = vi.hoisted(() => ({ user: { id: "u1", email: "leo@example.com" } as { id: string; email: string } | null }));
vi.mock("@/lib/useLeoOnly", () => ({ useLeoUser: () => leo.user, useLeoOnly: () => !!leo.user }));

const { default: ScriptCard } = await import("./ScriptCard");
const { defaultSettings } = await import("@/lib/videoEdit");

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
});
const PRESENTER = { id: "pr-a1", name: "Mei", look: "A Chinese Singaporean woman", url: "https://hf.example/p1.jpg", photo: "data:image/jpeg;base64,/9j/AAAA", createdAt: new Date().toISOString(), status: "on" };

const project = {
  id: "v1", name: "Plans", createdAt: "2026-10-22T00:00:00.000Z", updatedAt: "", duration: 9, size: 1000, thumb: "",
  words: [{ w: "Most", s: 0.2, e: 0.6 }, { w: "people", s: 0.6, e: 1.1 }, { w: "overpay.", s: 1.1, e: 2 }, { w: "Get", s: 4.3, e: 4.6 }, { w: "a", s: 4.6, e: 4.7 }, { w: "plan.", s: 4.7, e: 5.4 }],
  settings: defaultSettings("bold"),
  ai: {
    kind: "avatar" as const, person: "presenter" as const, who: "pr-a1", voice: "premade" as const, voiceId: "alice" as const, madeAt: "2026-10-22T01:00:00.000Z",
    slices: [{ text: "", start: 0, end: 4, clip: "ai-slice-j1-0-0" }, { text: "", start: 4, end: 9, clip: "ai-slice-j1-1-0" }],
  },
};
type P = typeof project;
const html = (p: P | Omit<P, "ai">, at = "/edit?p=v1") =>
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [at] }, createElement(ScriptCard, { userId: "u1", project: p as P, onPut: () => {} })));

beforeEach(() => {
  store.clear();
  store.set("content-studio-presenters-u1", JSON.stringify({ who: "ask", prefs: {}, items: [PRESENTER] }));
  leo.user = { id: "u1", email: "leo@example.com" };
});

describe("the Script card", () => {
  it("shows only for Leo, on a video of a kept face that has its parts", () => {
    expect(html(project)).toContain("Fix a line");
    const { ai: _ai, ...plain } = project;
    expect(html(plain)).toBe("");
    expect(html({ ...project, ai: { ...project.ai, person: "generated" } } as unknown as P)).toBe("");
    expect(html({ ...project, ai: { ...project.ai, slices: undefined } } as unknown as P)).toBe("");
    leo.user = null;
    expect(html(project, "/edit?p=v1&script=1&lang=zh")).toBe("");
  });

  it("opens on ?script=1 with each part's words from the captions and its time", () => {
    const open = html(project, "/edit?p=v1&script=1");
    expect(open).toContain("Most people overpay.");
    expect(open).toContain("Get a plan.");
    expect(open).toContain("0:00-0:04");
    expect(open).toContain("0:04-0:09");
    expect(open).toContain("Make it in another language");
    expect(open).not.toContain("Remakes");
  });

  it("prices an edited line, asks to hear it first, and turns a red flag into Make it anyway", () => {
    store.set("cs-script-v1", JSON.stringify({ edits: ["Most people overpay.", "Get one plan you understand."] }));
    const one = html(project, "/edit?p=v1&script=1");
    expect(one).toContain("edited");
    expect(one).toContain("Remakes 1 part of 2.");
    expect(one).toContain("About US$1.38");
    expect(one).toContain("Hear it");
    expect(one).toContain("Hear each changed line first.");
    expect(one).toMatch(/<button[^>]*disabled=""[^>]*>Remake changed parts<\/button>/);

    store.set("cs-script-v1", JSON.stringify({ edits: ["It's risk-free.", "Get one plan you understand."] }));
    const red = html(project, "/edit?p=v1&script=1");
    expect(red).toContain("Remakes 2 parts of 2.");
    expect(red).toContain("Compliance error");
    expect(red).toContain("Check the flagged words first.");
    expect(red).toContain("Make it anyway");
    expect(red).not.toContain("Remake changed parts");
  });

  it("asks you to record the line when the video has your own voice", () => {
    store.set("cs-script-v1", JSON.stringify({ edits: ["Most people overpay.", "Get one plan you understand."] }));
    const mine = html({ ...project, ai: { ...project.ai, voice: undefined, voiceId: undefined } } as unknown as P, "/edit?p=v1&script=1");
    expect(mine).toContain("Your own voice is in this video, so record each changed line again.");
    expect(mine).toContain("Record it");
    expect(mine).toContain("Record each changed line first.");
    expect(mine).not.toContain("Hear it");
    expect(mine).not.toContain('aria-label="Voice"');

    // its other language is spoken by a premade voice, picked here, and the card says it won't sound like you
    store.set("cs-script-v1", JSON.stringify({ review: { lang: "ta", lines: ["ஒன்று.", "இரண்டு."] } }));
    const ta = html({ ...project, ai: { ...project.ai, voice: undefined, voiceId: undefined } } as unknown as P, "/edit?p=v1&script=1&lang=ta");
    expect(ta).toContain('aria-label="Voice"');
    expect(ta).toContain("The Tamil version is spoken by the voice you pick, so it won&#x27;t sound like you.");
    expect(html(project, "/edit?p=v1&script=1&lang=ta")).not.toContain("won&#x27;t sound like you");
  });

  it("lets you pick the voice when a premade video didn't record which", () => {
    store.set("cs-script-v1", JSON.stringify({ edits: ["Most people overpay.", "Get one plan you understand."] }));
    const unknown = html({ ...project, ai: { ...project.ai, voiceId: undefined } } as unknown as P, "/edit?p=v1&script=1");
    expect(unknown).toContain('aria-label="Voice"');
    expect(unknown).toContain("Hear it");
    expect(html(project, "/edit?p=v1&script=1")).not.toContain('aria-label="Voice"');
  });

  it("opens a language's review beside the English with its price, or the button that translates it", () => {
    expect(html(project, "/edit?p=v1&script=1&lang=ms")).toContain("Translate to Malay");
    store.set("cs-script-v1", JSON.stringify({ review: { lang: "zh", lines: ["大多数人付太多。", "找一个计划。"] } }));
    const zh = html(project, "/edit?p=v1&script=1&lang=zh");
    expect(zh).toContain("大多数人付太多。");
    expect(zh).toContain("Check the Chinese before it&#x27;s made.");
    expect(zh).toContain("About US$2.08");
    expect(zh).toContain("Make the Chinese video");
    expect(zh).toContain("Back to the script");
    // ?lang means nothing without the card open
    expect(html(project, "/edit?p=v1&lang=zh")).not.toContain("Make the Chinese video");
  });

  it("says so when the face is gone, and offers no fix", () => {
    store.delete("content-studio-presenters-u1");
    const gone = html(project, "/edit?p=v1&script=1");
    expect(gone).toContain("The face in this video isn&#x27;t saved any more, so it can&#x27;t be made again.");
    expect(gone).not.toContain("Fix a line");
    expect(gone).not.toContain("Most people overpay.");
  });
});
