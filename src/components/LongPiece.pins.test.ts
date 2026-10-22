// Idea Dump and One long piece, five posts are live for everyone on /coach: their first frames must draw exactly as
// they did before the interview and the voice note (pinned on today's code at eaaa6379). Rendered to markup in node,
// so no effects run. Never update the pinned files with vitest -u.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const as = vi.hoisted(() => ({ user: null as null | undefined | { id: string; email: string } }));
vi.mock("@/lib/useLeoOnly", () => ({ useLeoUser: () => as.user, useLeoOnly: () => Boolean(as.user) }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) }, functions: { invoke: vi.fn() } },
}));

const { default: IdeaDump } = await import("./IdeaDump");
const { default: LongPiece } = await import("./LongPiece");
const html = (C: () => JSX.Element, at = "/coach") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [at] }, createElement(C)));

afterEach(() => {
  as.user = null;
  vi.unstubAllGlobals();
});

describe("Idea Dump for everyone", () => {
  it("draws today's section where the browser has no speech recognition", async () => {
    await expect(html(IdeaDump)).toMatchFileSnapshot("./__pins__/idea-dump-everyone.html");
  });
  it("draws today's section with Dictate where the browser has it", async () => {
    vi.stubGlobal("window", { webkitSpeechRecognition: class {} });
    const out = html(IdeaDump);
    expect(out).toContain("Dictate");
    await expect(out).toMatchFileSnapshot("./__pins__/idea-dump-everyone-dictate.html");
  });
});

describe("One long piece, five posts for everyone", () => {
  it("draws today's paste box, and Leo's switch params change nothing", async () => {
    const out = html(LongPiece);
    await expect(out).toMatchFileSnapshot("./__pins__/long-piece-everyone.html");
    for (const at of ["/coach?piece=questions#long-piece", "/coach?piece=voice", "/coach#long-piece"]) expect(html(LongPiece, at)).toBe(out);
  });
  it("draws today's paste box while the sign-in is still being read", async () => {
    as.user = undefined;
    await expect(html(LongPiece, "/coach?piece=questions")).toMatchFileSnapshot("./__pins__/long-piece-everyone.html");
  });
});

describe("One long piece, five posts for Leo", () => {
  it("shows the three-way switch, Answer questions first, and the paste box only on Paste text", () => {
    as.user = { id: "u1", email: "leo@example.com" };
    const out = html(LongPiece);
    expect(out).toMatch(/aria-pressed="true"[^>]*>Answer questions</);
    expect(out).toContain(">Voice note</button>");
    expect(out).toContain(">Paste text</button>");
    expect(out).not.toContain('id="long-piece-text"');
    expect(html(LongPiece, "/coach?piece=paste")).toContain('id="long-piece-text"');
    expect(html(LongPiece, "/coach?piece=voice")).toMatch(/aria-pressed="true"[^>]*>Voice note</);
    expect(html(LongPiece, "/coach?piece=nonsense")).toMatch(/aria-pressed="true"[^>]*>Answer questions</);
  });
});
