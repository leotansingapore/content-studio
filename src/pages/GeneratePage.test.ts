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

const { default: GeneratePage, FIX_ASK, moveHashtagsToComment, newHookContext, rewriteLabel, versionOf, withOpening } = await import("./GeneratePage");
const { FACTORS } = await import("@/lib/postScore");
const { splitHook } = await import("@/lib/variants");
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

// North star phase 7a (Leo only): the pieces Write's score fixes and new hooks are built from.
describe("Write's fix asks and new hooks", () => {
  it("titles a fix by its factor and keeps every other rewrite's title", () => {
    expect(rewriteLabel("ask", "First line")).toBe("Fix: First line");
    expect(rewriteLabel("ask")).toBe("Your change");
    expect(rewriteLabel("shorter")).toBe("Shorter");
    expect(rewriteLabel("lines")).toBe("Rewrite flagged lines");
  });
  it("has one fixed ask per score factor, and the concrete fix adds no number", () => {
    expect(Object.keys(FIX_ASK).sort()).toEqual(Object.keys(FACTORS).sort());
    expect(FIX_ASK.specific).toContain("Do not add any number that is not already in the post.");
    expect(FIX_ASK.hook).toContain("Keep every other line word for word.");
  });
  it("sends the body as it is under the new-hook ask", () => {
    expect(newHookContext("Body line.\n\nSave this.")).toBe(
      "Write a new opening line for this finished post. Keep it under 25 words. The body below stays exactly as it is, so the line must lead into it.\n\nBody line.\n\nSave this.",
    );
  });
  it("swaps only the first line, so the body stays byte for byte", () => {
    const post = "I reviewed 40 plans this year.\n\nMost paid twice for the same cover.\n  - check your rider\n\nSave this.\n";
    const next = withOpening(post, "  Your hospital plan may already cover this.  ");
    expect(next).toBe("Your hospital plan may already cover this.\n\nMost paid twice for the same cover.\n  - check your rider\n\nSave this.\n");
    expect(splitHook(next, "Your hospital plan may already cover this.")).toBe(splitHook(post, "I reviewed 40 plans this year."));
    // a script keeps its spoken label
    expect(withOpening("**HOOK (0-3s):** Old line\nBODY: rest", "New line")).toBe("**HOOK (0-3s):** New line\nBODY: rest");
    expect(withOpening("HOOK: Old\nrest", "New")).toBe("HOOK: New\nrest");
    expect(withOpening("One line only", "New")).toBe("New");
  });
  it("makes a version with the parent's brief and source, and nothing posted, scheduled or scored", () => {
    const parent = {
      id: "p1", createdAt: "2026-10-01T00:00:00.000Z", hook: "Old", draft: "Old\n\nBody", pillar: "topic", pillarDetail: "CPF", audience: "parent",
      format: "text-post", platform: "linkedin", ctaType: "dm-keyword", status: "posted" as const, postedAt: "2026-10-02T00:00:00.000Z",
      scheduledFor: "2026-10-02T09:00", metrics: { reactions: 3 }, zernio: { postId: "z1" } as never, score: { v: 6, down: [], key: "k", at: "a" },
      source: { kind: "top", key: "top:x", title: "x" } as never, labels: ["lb-1"], hookFormula: "number-reveal",
    };
    const set = { id: "vs-1", kind: "versions" as const, from: "p1" };
    const v = versionOf(parent, "New\n\nBody", "New", "contrarian", set, "v1", "2026-10-25T00:00:00.000Z");
    expect(v).toEqual({
      id: "v1", createdAt: "2026-10-25T00:00:00.000Z", hook: "New", draft: "New\n\nBody", pillar: "topic", pillarDetail: "CPF", audience: "parent",
      format: "text-post", platform: "linkedin", ctaType: "dm-keyword", status: "draft", source: parent.source, labels: ["lb-1"], hookFormula: "contrarian", set,
    });
    expect(parent.status).toBe("posted");
  });
  it("moves trailing hashtags to the first comment, and nothing else", () => {
    expect(moveHashtagsToComment("Save this for your CPF review.\n\n#cpf #savings\n#sg ")).toEqual({ body: "Save this for your CPF review.", comment: "#cpf #savings #sg" });
    expect(moveHashtagsToComment("Post #one", "Book: https://cal.com/leo")).toEqual({ body: "Post", comment: "Book: https://cal.com/leo\n\n#one" });
    expect(moveHashtagsToComment("#cpf in the middle, not at the end.")).toBeNull();
    expect(moveHashtagsToComment("#only #tags")).toBeNull();
    expect(moveHashtagsToComment("Ends on a word#notatag")).toBeNull();
  });
});
