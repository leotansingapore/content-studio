// Write serves everyone. Rendered to markup in node (no effects run, so no session, draft or prefill is read yet):
// everyone else's first frame, on the brief and on the Format step a prefill link opens, draws exactly as it did
// before edit-translate's Language row and versions (sha256 of the markup, pinned on today's code at 7cd872f4).
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
// the shared tab row reads the rails store, which has no server snapshot; it is not this page's to pin
vi.mock("@/components/SectionTabs", () => ({ default: () => createElement("nav", { "data-pin": "section-tabs" }), WRITE_TABS: [] }));

const { default: GeneratePage } = await import("./GeneratePage");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
// the page reads the address once on its first frame (arrivedWithBrief); node has no window
const html = (at: string) => {
  vi.stubGlobal("window", { location: new URL(`http://localhost${at}`) });
  vi.spyOn(Math, "random").mockReturnValue(0.42); // the quick tip and the hook set are picked at random
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [at] }, createElement(GeneratePage)));
};

const BRIEF = "f4c7d387ff40624b82cd9971eaed78892e7f7872437c7e078a8f436a2ea7f753";
const FORMAT_STEP = "4e74965a6dd469c3c0ab2a4128aa1f5cf2791767d22bc45aff07c2341545667f";

describe("Write for everyone else", () => {
  it("draws today's brief", () => {
    expect(sha(html("/generate"))).toBe(BRIEF);
  });
  it("draws today's Format step, with or without a lang the link carries", () => {
    const at = "/generate?step=format&pillar=topic&detail=Hospital+co-pays&format=carousel&platform=instagram";
    expect(html(at)).toContain("Where and how to post");
    expect(sha(html(at))).toBe(FORMAT_STEP);
    expect(html(`${at}&lang=zh`)).toBe(html(at));
  });
});
