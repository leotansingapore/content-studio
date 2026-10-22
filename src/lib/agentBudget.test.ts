import { describe, expect, it, vi } from "vitest";
import { NEEDS, UNREAD_LINE, budgetAnswer, cheaperFor, leftOf, meterLine, needsOf, refusal, shortOf, type Plan } from "@/lib/agentBudget";
import { explainerPrice } from "@/data/formats";
import { AVATAR_MAX, priceOf, priceText, sumPrices, type Price } from "@/lib/prices";

// contracts (wave 1) declares agent-act 100 and skill-answer 10; until it merges the test adds them as its table says,
// and once it has merged the real values win.
vi.mock("../../supabase/functions/_shared/usageCaps.ts", async (orig) => {
  const m = await orig<typeof import("../../supabase/functions/_shared/usageCaps.ts")>();
  return { ...m, DAILY_LIMITS: { "agent-act": 100, "skill-answer": 10, ...m.DAILY_LIMITS } };
});

const NOW = new Date("2026-10-22T03:00:00Z");
const today = (used: Record<string, number>) => ({ day: "2026-10-22", used });
const caps = (plan: Plan, o?: Parameters<typeof needsOf>[1]) => needsOf(plan, o).map((n) => n.feature);
const shortCaps = (...a: Parameters<typeof shortOf>) => shortOf(...a).map((s) => s.feature);

describe("NEEDS", () => {
  it("has a row for every plan, scarcest cap first", () => {
    expect(Object.keys(NEEDS).sort()).toEqual(
      ["answer", "campaign", "carousel", "competitor", "edit", "explainer", "image", "learning", "link", "move", "post", "script", "slideshow", "speaking", "wall", "write"],
    );
    expect(caps("post")).toEqual(["remix-make"]);
    expect(caps("link")).toEqual(["remix-make", "remix-link"]);
    expect(caps("explainer")).toEqual(["ai-video", "ai-voice", "ai-video-script"]);
    expect(caps("image")).toEqual(["ai-image"]);
    expect(caps("competitor")).toEqual(["competitor-read"]);
    expect(caps("answer")).toEqual(["skill-answer"]);
    expect([caps("move"), caps("write"), caps("learning")]).toEqual([[], [], []]);
  });

  it("speaking adds remix-make only while the script is to write and ai-image only for a new presenter", () => {
    expect(caps("speaking")).toEqual(["ai-video", "remix-make", "ai-voice"]);
    expect(caps("speaking", { write: false })).toEqual(["ai-video", "ai-voice"]);
    expect(caps("speaking", { write: false, presenter: true })).toEqual(["ai-video", "ai-voice", "ai-image"]);
  });

  it("a campaign writes 7 posts a use, and an edit to a video is a vibe edit", () => {
    expect(needsOf("campaign", { posts: 28 })).toEqual([{ feature: "campaign-draft", n: 4 }]);
    expect(needsOf("campaign", { posts: 12 })).toEqual([{ feature: "campaign-draft", n: 2 }]);
    expect(caps("edit")).toEqual(["edit-ask"]);
    expect(caps("edit", { video: true })).toEqual(["vibe-edit"]);
  });
});

describe("shortOf", () => {
  const o = { leoGlobal: false, now: NOW };
  it("speaking is short of whatever cap is used up", () => {
    expect(shortOf(needsOf("speaking"), today({ "ai-video": 2 }), o)).toEqual([{ feature: "ai-video", needs: 1, left: 0 }]);
    expect(shortCaps(needsOf("speaking"), today({ "ai-voice": 10 }), o)).toEqual(["ai-voice"]);
  });
  it("is short of ai-image with no saved face, and not with one", () => {
    const usage = today({ "ai-image": 5 });
    expect(shortCaps(needsOf("speaking", { presenter: true }), usage, o)).toEqual(["ai-image"]);
    expect(shortCaps(needsOf("speaking", { presenter: false }), usage, o)).toEqual([]);
  });
  it("checks ai-video-global only on Leo's sign-in, and only short when that row is there", () => {
    const usage = today({ "ai-video-global": 20 });
    expect(shortCaps(needsOf("speaking"), usage, { leoGlobal: true, now: NOW })).toEqual(["ai-video-global"]);
    expect(shortCaps(needsOf("speaking"), usage, o)).toEqual([]);
    expect(shortCaps(needsOf("speaking"), today({}), { leoGlobal: true, now: NOW })).toEqual([]);
  });
  it("is empty when counts weren't read, reads yesterday's counts as zero, and counts several uses", () => {
    expect(shortOf(needsOf("speaking"), null, o)).toEqual([]);
    expect(shortOf(needsOf("speaking"), { day: "2026-10-21", used: { "ai-video": 2 } }, o)).toEqual([]);
    expect(shortOf(needsOf("campaign", { posts: 28 }), today({ "campaign-draft": 17 }), o)).toEqual([{ feature: "campaign-draft", needs: 4, left: 3 }]);
    expect(shortOf(NEEDS.answer, today({ "skill-answer": 10 }), o)).toEqual([{ feature: "skill-answer", needs: 1, left: 0 }]);
  });
});

describe("cheaperFor", () => {
  const plans = (plan: Plan, used: Record<string, number>) => cheaperFor(plan, today(used), NOW).map((x) => x.chip);
  it("walks each ladder in order, two at most", () => {
    expect(plans("speaking", {})).toEqual(["Make the picture post", "Write the script"]);
    expect(plans("explainer", {})).toEqual(["Make the picture post", "Write the script"]);
    expect(plans("image", {})).toEqual(["Make a carousel instead", "Make a text post instead"]);
    expect(plans("post", {})).toEqual(["Write it in Write"]);
    expect(plans("competitor", {})).toEqual(["Paste their profile link instead"]);
    expect(plans("move", {})).toEqual([]);
  });
  it("skips an option whose own cap is used up", () => {
    expect(plans("speaking", { "ai-image": 5 })).toEqual(["Write the script", "Write it in Write"]);
    expect(plans("speaking", { "ai-image": 5, "remix-make": 30 })).toEqual(["Write it in Write"]);
    expect(plans("image", { "remix-make": 30 })).toEqual([]);
  });
  it("gives Write its format and each capped offer its uses left", () => {
    const fmt = (plan: Plan) => cheaperFor(plan, today({}), NOW).find((x) => x.plan === "write")?.format;
    expect([fmt("post"), fmt("carousel"), fmt("script")]).toEqual(["text-post", "carousel", "short-video"]);
    expect(cheaperFor("speaking", today({ "ai-image": 1 }), NOW)[0]).toEqual({ plan: "image", chip: "Make the picture post", left: 4 });
  });
});

describe("refusal", () => {
  const p = (x: Price | "pick" | null) => priceText(x as Price).replace(/^./, (c) => c.toLowerCase());
  it("names what is short and the two offers with their price, the first with its uses left", () => {
    const usage = today({ "ai-video": 2, "ai-image": 1 });
    const short = shortOf(needsOf("speaking"), usage, { leoGlobal: false, now: NOW });
    expect(refusal("speaking", short, cheaperFor("speaking", usage, NOW))).toBe(
      "A talking video needs 1 AI video, and you have none left today. They come back at 8am Singapore time.\n" +
        `A picture post is ${p(priceOf("ai-image"))} (4 of 5 pictures left), or a script you film yourself is ${p(priceOf("remix-make"))}.`,
    );
    expect(p(priceOf("ai-image"))).toBe("under US$0.01");
    expect(p(priceOf("remix-make"))).toBe("about US$0.02");
  });
  it("says unit words in the singular and plural, and what is left when it is not none", () => {
    const short = [{ feature: "campaign-draft" as const, needs: 4, left: 3 }];
    expect(refusal("campaign", short, [])).toBe("A campaign needs 4 campaign writes, and you have 3 left today. They come back at 8am Singapore time.");
    expect(refusal("image", [{ feature: "ai-image", needs: 1, left: 0 }], [])).toBe(
      "A picture needs 1 AI picture, and you have none left today. They come back at 8am Singapore time.",
    );
  });
  it("names the studio's limit when the across-everyone row is the short one, and leaves out offers with no name", () => {
    expect(refusal("speaking", [{ feature: "ai-video-global", needs: 1, left: 0 }], [{ plan: "write", chip: "Write it in Write", format: "short-video" }])).toBe(
      "Today's AI videos for the whole studio are used up. They come back at 8am Singapore time.",
    );
  });
});

describe("budgetAnswer and meterLine", () => {
  it("answers with today's counts and the prices from the table", () => {
    const talk = sumPrices(priceOf("remix-make"), AVATAR_MAX, priceOf("ai-voice"), priceOf("ai-image")) as Price;
    expect(budgetAnswer(today({ "remix-make": 2, "agent-act": 3 }), NOW)).toBe(
      "Left today: 2 of 2 AI videos, 10 of 10 voiceovers, 5 of 5 AI pictures, 28 of 30 remixes, 97 of 100 agent messages. They come back at 8am Singapore time.\n" +
        "A talking video is up to US$5.55, an explainer about US$0.06 and a picture under US$0.01. Posts, carousels and scripts are about US$0.02 each.",
    );
    expect([priceText(talk), priceText(explainerPrice() as Price)]).toEqual(["Up to US$5.55", "About US$0.06"]);
  });
  it("says so when today's counts can't be read", () => {
    expect(budgetAnswer(null, NOW)).toBe(UNREAD_LINE);
    expect(UNREAD_LINE).toBe("I can't read today's limits right now. Paid makes still check them before they run.");
  });
  it("counts agent messages down, warns at 10 and says it is used up at 0", () => {
    expect(meterLine(leftOf(today({ "agent-act": 3 }), "agent-act", NOW))).toEqual({ text: "97 of 100 agent messages left today", warn: false });
    expect(meterLine(11)).toEqual({ text: "11 of 100 agent messages left today", warn: false });
    expect(meterLine(10)).toEqual({ text: "10 of 100 agent messages left today", warn: true });
    expect(meterLine(0)).toEqual({ text: "Agent actions are used up until 8am Singapore time. Questions still get answers.", warn: true });
    expect(meterLine(null)).toBeNull();
  });
});
