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
// React's generated ids (useId, behind the Radix selects) follow the number of children a parent has, so a Leo-only
// slot renumbers them with nothing drawn differently: they are left out of the hash
const sha = (s: string) => createHash("sha256").update(s.replace(/radix-:[A-Za-z0-9]+:/g, "radix-id")).digest("hex");
// the page reads the address once on its first frame (arrivedWithBrief); node has no window
const html = (at: string) => {
  vi.stubGlobal("window", { location: new URL(`http://localhost${at}`) });
  vi.spyOn(Math, "random").mockReturnValue(0.42); // the quick tip and the hook set are picked at random
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [at] }, createElement(GeneratePage)));
};

const BRIEF = "2b5385fa33a39558012cb2ddc9a65c1ed00f163521315362f095a2e2fd212333";
const FORMAT_STEP = "522687636720d52f30194643103c272852071054ea2c02a15d7d8c4fc2c62ccc";
// a plan slot's link as planItemToGenerateUrl builds it, with no aud or label (checked on today's code at eaaa6379)
const PLAN_LINK_AT =
  "/generate?pillar=topic&detail=Hospital+co-pays&audience=parent&format=carousel&platform=instagram&cta=save-share&funnel=attraction&idea=common-mistake&ctx=Most+people+pay+twice";

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
  // the pre-fill is an effect, so it runs after this frame; what it sends is checked in the browser
  it("draws today's brief, audience chips included, on a plan slot's link", () => {
    expect(html(PLAN_LINK_AT)).toContain("Audience / life-stage");
    expect(sha(html(PLAN_LINK_AT))).toBe(BRIEF);
    expect(html(`${PLAN_LINK_AT}&aud=au-lq3k9z&label=lb-1`)).toBe(html(PLAN_LINK_AT));
  });
});
