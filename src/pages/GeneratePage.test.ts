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

const { default: GeneratePage, optionsFor, FIX_ASK, HOOK_FACTS_RULE, fixAsk, fixedText, hookBlank, hookFields, rewriteFields, moveHashtagsToComment, newHookContext, rewriteLabel, versionOf, withOpening } = await import("./GeneratePage");
const { BLANKS_RULE } = await import("@/lib/platformCounters");
const { adviserWordsIn } = await import("../../supabase/functions/_shared/adviserWords");
const { MAX_BODY_CHARS, MAX_CHARS, requestError } = await import("../../supabase/functions/generate-social-content/logic");
const { hookFormula } = await import("@/lib/hookFormulas");
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
describe("Write's examples for the brand's profession", () => {
  const values = (o: ReturnType<typeof optionsFor>) => Object.values(o).map((list) => list.map((x: { value: string }) => x.value));
  it("are today's for an adviser or a brand with nothing set", () => {
    expect(JSON.stringify(optionsFor(false))).toContain("CPF SA top-ups");
    expect(sha(JSON.stringify(optionsFor(false)))).toBe("4ef1c414378d32626b4c3a7095e286cd52100762f931d57fad14d941c211e8a3"); // today's lists, on 47e27562
  });
  it("offer the same choices in the same order, worded with none of the adviser words, for any other work", () => {
    expect(values(optionsFor(true))).toEqual(values(optionsFor(false)));
    expect(adviserWordsIn(JSON.stringify(optionsFor(true)))).toEqual([]);
  });
});

// Drafts have no length cap (Facebook takes 63,206 characters; CSV import any), so this is a generous real one: a
// 12,000-character post, a 1,000-character ask, a long voice summary and Leo's memory (at most 1,500) on the context.
describe("Write's largest rewrite request", () => {
  const fill = (n: number) => "word ".repeat(Math.ceil(n / 5)).slice(0, n);
  it("passes the post writer's checks with at least a quarter of every cap to spare, and so do its hashtags and picture", () => {
    const post = fill(12_000);
    const base = { pillar: "topic", pillarDetail: fill(200), ideaSource: "A common mistake people make", format: "text-post", platform: "facebook", ctaType: "open-question", audience: "general", voiceSummary: fill(4000), singlish: true } as const;
    const fields = rewriteFields(post, "ask", [], fill(1000));
    const body = { ...base, ...fields, ideaContext: `${fields.ideaContext}\n\n${fill(1500)}`, mode: "post", n: 3, stream: true } as const;
    expect(requestError(body)).toBeNull();
    expect(body.ideaContext.length).toBeLessThanOrEqual(MAX_CHARS.ideaContext! * 0.75);
    expect(body.styleReference.length).toBeLessThanOrEqual(MAX_CHARS.styleReference! * 0.75);
    expect(JSON.stringify(body).length).toBeLessThanOrEqual(MAX_BODY_CHARS * 0.75);
    for (const mode of ["hashtags", "image-prompt"] as const) {
      const side = { ...base, draft: post, mode };
      expect(requestError(side)).toBeNull();
      expect(post.length).toBeLessThanOrEqual(MAX_CHARS.draft! * 0.75);
    }
  });
});

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

// live-p7a D9: Try new hooks on ActivityTracker (calls 041 and 042) sent the post's blanks rule, which asks for
// "[your number]" blanks, and wrote "[Number] things I wish I knew..." and "After [your years] as a financial consultant"
describe("Write's hooks have no blanks (Leo only)", () => {
  const base = { ideaContext: `${newHookContext("When client messages sit in different places, a call takes extra effort.")}\n\n${BLANKS_RULE}`, styleReference: undefined };
  it("asks each hook with the hook's facts rule in place of the post's blanks rule, in the brand's speaker", () => {
    const list = hookFields(hookFormula("list")!, base, "business");
    expect(list.ideaContext).not.toContain(BLANKS_RULE);
    expect(list.ideaContext).not.toContain("square brackets that says what goes there");
    expect(list.ideaContext).toContain(HOOK_FACTS_RULE);
    expect(list.ideaContext).toContain("That count is its shape, not a fact.");
    expect(list.ideaContext.startsWith(newHookContext("When client messages sit in different places, a call takes extra effort."))).toBe(true);
    expect(list.styleReference).toContain("Write as the business: we, us or its name, never I, me or my.");
    const insider = hookFields(hookFormula("insider")!, base, "business");
    expect(insider.ideaContext).not.toContain("That count");
    expect(insider.styleReference).not.toMatch(/financial consultant|years as/);
    // a brief with no context still gets the rule
    expect(hookFields(hookFormula("insider")!, {}, "person").ideaContext).toContain(HOOK_FACTS_RULE);
  });
  it("never offers a hook that came back with a blank in it", () => {
    expect(hookBlank("[Number] things I wish I knew before managing sales follow-ups solo.")).toBe(true);
    expect(hookBlank("After [your years] as a financial consultant, here's what nobody tells you...")).toBe(true);
    expect(hookBlank("3 things I wish I knew before managing sales follow-ups solo.")).toBe(false);
    expect(hookBlank("If you still search across chats for client context before a call, stop.")).toBe(false);
    expect(hookBlank("[HOOK] Your follow-ups live in five apps.")).toBe(false);
  });
});

// live-p7a D11: Fix this on Clear ask (call 039, ledger 00:32:56) came back with the post's 4 hashtags gone and "DM me
// WORKFLOW" for a business brand; Use this applied all of it
describe("Fix this changes only what its factor is about (Leo only)", () => {
  const body = [
    "One change brought the pieces together: client notes went from scattered across chats to one clearer sales workflow.",
    "When client messages and follow-ups sit in different places, getting ready for a call can take extra effort.",
    "ActivityTracker combines client records, WhatsApp conversations, follow-up tasks and sales goals in one app.",
    "Then use tasks to organise follow-ups and goals to track sales activity.",
  ];
  const post = [...body, "Explore a more connected way to manage your sales workflow.", "#SalesFollowUp #WhatsAppWorkflow #ClientManagement #SalesGoals"].join("\n\n");
  const reply = [...body.map((l) => l.replace("can take", "takes")), "DM us WORKFLOW to see a more connected sales workflow."].join("\n\n");

  it("swaps only the last line on a Clear ask fix and keeps the hashtags byte for byte", () => {
    expect(fixedText(post, reply, "cta")).toBe(post.replace("Explore a more connected way to manage your sales workflow.", "DM us WORKFLOW to see a more connected sales workflow."));
    // a reply that ends on its own hashtags gives its ask, not its tags
    expect(fixedText(post, `${reply}\n\n#Sales`, "cta")).toBe(fixedText(post, reply, "cta"));
  });
  it("swaps only the first line on a First line fix, keeping a script's label", () => {
    expect(fixedText(post, `What if one app held every client chat?\n\n${reply}`, "hook")).toBe(withOpening(post, "What if one app held every client chat?"));
    expect(fixedText("HOOK: Old line\nBODY: rest\n\n#tag", "HOOK: New line\nBODY: other", "hook")).toBe("HOOK: New line\nBODY: rest\n\n#tag");
  });
  it("keeps the post's own hashtags on a fix that rewrites the body", () => {
    const tags = "\n\n#SalesFollowUp #WhatsAppWorkflow #ClientManagement #SalesGoals";
    expect(fixedText(post, reply, "readable")).toBe(`${reply}${tags}`);
    expect(fixedText(post, `${reply}\n\n#Other #Tags`, "oneIdea")).toBe(`${reply}${tags}`);
    expect(fixedText("No tags here.", "Shorter.\n\n#added", "specific")).toBe("Shorter.");
  });
  // live-p7a D12: First line came back "One change brought the pieces together: ..." (call 037), the same line reordered,
  // because the ask also said to keep "the same opening line idea"; Clear ask was told to keep "the same call to action"
  it("never tells the writer to keep the line a fix is about", () => {
    for (const id of Object.keys(FIX_ASK) as (keyof typeof FIX_ASK)[]) {
      const { ideaContext } = rewriteFields(post, "ask", [], FIX_ASK[id], true);
      expect(ideaContext, id).toContain(FIX_ASK[id]);
      expect(ideaContext, id).not.toMatch(/the same opening line idea|the same call to action|the same points/);
      expect(ideaContext, id).toContain("Keep everything the instruction does not ask to change.");
    }
    // an asked change from the assistant keeps today's wording
    expect(rewriteFields(post, "ask", [], "end on a question").ideaContext).toContain(
      "Keep everything the instruction does not ask to change: the same opening line idea, the same points in the same order, the same facts and numbers, and the same call to action.",
    );
  });

  it("asks a business brand's fix as the business, and an adviser's as today", () => {
    for (const id of Object.keys(FIX_ASK) as (keyof typeof FIX_ASK)[]) {
      expect(fixAsk(id, "person")).toBe(FIX_ASK[id]);
      expect(fixAsk(id, "business")).not.toMatch(/client story/);
    }
    expect(fixAsk("cta", "business")).toContain("Write as the business: we, us or its name, never I, me or my.");
    expect(fixAsk("cta", "business")).toContain("Keep every other line word for word.");
  });
});
