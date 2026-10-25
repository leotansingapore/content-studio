import { describe, expect, it } from "vitest";
import {
  FACTORS,
  FACTOR_IDS,
  SCORE_FORMATS,
  SCORE_QUESTIONS,
  composeScore,
  labelFor,
  mostlyEnglish,
  parseScoreRequest,
  scoreQuestions,
  scoreState,
  tipFor,
} from "./logic";

const post = "I paid $0 for my first hospital stay. My friend paid $11,400.\n\nSame ward. Same week.";

describe("parseScoreRequest", () => {
  it("takes a draft and a known platform, Instagram otherwise", () => {
    expect(parseScoreRequest({ text: `  ${post}  `, platform: "linkedin" })).toEqual({ ok: true, text: post, platform: "linkedin", format: "text-post" });
    expect(parseScoreRequest({ text: post, platform: "myspace" })).toMatchObject({ ok: true, platform: "instagram" });
  });

  it("keeps text-post as the default, takes the three formats and refuses any other", () => {
    expect(parseScoreRequest({ text: post, format: null })).toMatchObject({ ok: true, format: "text-post" });
    for (const format of SCORE_FORMATS) expect(parseScoreRequest({ text: post, format })).toMatchObject({ ok: true, format });
    for (const format of ["story", "Carousel", "reel", 3, ""]) {
      expect(parseScoreRequest({ text: post, format })).toEqual({ ok: false, error: "Scores read text posts, carousels and short-video scripts." });
    }
  });

  it("refuses a draft too short or too long to score", () => {
    expect(parseScoreRequest({ text: "Too short" })).toMatchObject({ ok: false });
    expect(parseScoreRequest({ text: "x ".repeat(2600) })).toMatchObject({ ok: false });
    expect(parseScoreRequest(null)).toMatchObject({ ok: false });
  });
});

describe("mostlyEnglish", () => {
  it("scores English posts, with a few other words, and skips posts in another script", () => {
    expect(mostlyEnglish(post)).toBe(true);
    expect(mostlyEnglish(`${post} Huat ah! 加油`)).toBe(true);
    expect(mostlyEnglish("保险其实不贵。真正贵的是发现自己没有保障。今天就检查你的保单。")).toBe(false);
    expect(mostlyEnglish("12345 !!!")).toBe(false);
  });
});

describe("the questions", () => {
  it("asks one yes/no per factor about the post's own fields", () => {
    expect(Object.keys(SCORE_QUESTIONS)).toEqual(FACTOR_IDS);
    for (const q of Object.values(SCORE_QUESTIONS)) expect(q.type).toBe("noul");
    expect(scoreState(`\n  ${post}`, "tiktok")).toEqual({ platform: "TikTok", first_line: "I paid $0 for my first hospital stay. My friend paid $11,400.", post: `\n  ${post}` });
  });

  it("weights add up to 10", () => {
    expect(FACTOR_IDS.reduce((s, id) => s + FACTORS[id].weight, 0)).toBe(10);
  });
});

describe("the questions per format", () => {
  const script = "**HOOK (0-3s):** I paid $0 for my hospital stay.\nBODY: My friend paid $11,400.\nCTA: Comment RIDER.\n\n---\n\nCAPTION:\nSame ward, same week.";

  it("asks the same five ids as yes/no for every format, a text post word for word as before", () => {
    expect(scoreQuestions()).toBe(SCORE_QUESTIONS);
    expect(scoreQuestions("text-post")).toBe(SCORE_QUESTIONS);
    for (const format of SCORE_FORMATS) {
      const q = scoreQuestions(format);
      expect(Object.keys(q)).toEqual(FACTOR_IDS);
      for (const x of Object.values(q)) {
        expect(x.type).toBe("noul");
        const c = (x as { criteria: { true: string; false: string } }).criteria;
        expect(c.true.length).toBeGreaterThan(10);
        expect(c.false.length).toBeGreaterThan(10);
      }
    }
  });

  it("words each question for its shape", () => {
    expect(scoreQuestions("carousel").hook.instructions).toBe("Would the cover slide in `first_line` make someone scrolling `platform` stop and swipe to the next slide?");
    expect(scoreQuestions("short-video").hook.instructions).toBe("Would the opening line in `first_line`, said in the first 3 seconds of a `platform` video, make someone keep watching?");
    expect(scoreQuestions("carousel").oneIdea.instructions).toBe("Do the slides in `post` follow one clear idea, with one point per slide?");
    expect(scoreQuestions("short-video").oneIdea.instructions).toBe("Does the script in `post` stick to one clear idea from start to finish?");
    expect(scoreQuestions("carousel").specific.instructions).toBe(scoreQuestions("short-video").specific.instructions);
    expect(scoreQuestions("carousel").cta.instructions).toBe("Does the last slide or the caption in `post` ask the reader to do one specific thing next?");
    expect(scoreQuestions("short-video").cta.instructions).toBe("Does the script or caption in `post` end by asking the viewer to do one specific thing next?");
    expect(scoreQuestions("carousel").readable.instructions).toBe("Can each slide in `post` be read in about 3 seconds on a phone: a short title and at most two short sentences?");
    expect(scoreQuestions("short-video").readable.instructions).toBe("Does the script in `post` move quickly, with no slow stretch, and end soon after its last point?");
  });

  it("tells Jev what a carousel or script is, and reads a script's hook without its label", () => {
    const slides = "Slide 1: 3 things to check on your hospital plan\nSlide 2: Ward class. Pick the ward you would stay in.";
    expect(scoreState(slides, "instagram", "carousel")).toEqual({ platform: "Instagram", format: "carousel", first_line: "Slide 1: 3 things to check on your hospital plan", post: slides });
    expect(scoreState(script, "tiktok", "short-video")).toMatchObject({ platform: "TikTok", format: "short video script", first_line: "I paid $0 for my hospital stay." });
    expect(scoreState("HOOK:\n  Your CPF is not a savings account.\nBODY: x", "tiktok", "short-video").first_line).toBe("Your CPF is not a savings account.");
    expect(scoreState("[HOOK] Three plans, one claim.", "tiktok", "short-video").first_line).toBe("Three plans, one claim.");
    expect(scoreState(post, "linkedin", "text-post")).toEqual(scoreState(post, "linkedin"));
    expect(scoreState(post, "linkedin")).not.toHaveProperty("format");
  });

  it("has a tip for every factor and format, and names readable 'Easy to follow' for video only", () => {
    for (const id of FACTOR_IDS) {
      expect(tipFor(id)).toBe(FACTORS[id].tip);
      expect(tipFor(id, "text-post")).toBe(FACTORS[id].tip);
      for (const format of ["carousel", "short-video"] as const) {
        expect(tipFor(id, format)).toMatch(/^[A-Z].+\.$/);
      }
    }
    expect(tipFor("hook", "carousel")).toBe("Put the number, the surprise or the question on the cover. The cover decides if anyone swipes.");
    expect(tipFor("readable", "short-video")).toBe("Cut the slow parts and end soon after the last point.");
    expect(labelFor("readable", "short-video")).toBe("Easy to follow");
    expect(labelFor("readable", "carousel")).toBe("Easy to read");
    expect(labelFor("hook")).toBe("First line");
  });
});

describe("composeScore", () => {
  it("weighs the answers into a score out of 10", () => {
    const strong = { hook: 0.88, oneIdea: 0.92, specific: 0.99, cta: 0.98, readable: 0.9 };
    expect(composeScore(strong)).toEqual({ score: 9.3, down: [] });
  });

  it("names the costliest misses first, at most three", () => {
    const weak = { hook: 0.1, oneIdea: 0.11, specific: 0.04, cta: 0.07, readable: 0.37 };
    expect(composeScore(weak)).toEqual({ score: 1.3, down: ["hook", "specific", "oneIdea"] });
  });

  it("tops up to two with a doubtful check when only one is a clear miss", () => {
    const mid = { hook: 0.2, oneIdea: 0.9, specific: 0.7, cta: 0.95, readable: 0.55 };
    expect(composeScore(mid)?.down).toEqual(["hook", "readable"]);
  });

  it("gives no score when an answer is missing (Jev down)", () => {
    expect(composeScore({ hook: 0.5, oneIdea: 0.5, specific: 0.5, cta: 0.5, readable: null })).toBeNull();
    expect(composeScore({})).toBeNull();
  });
});
