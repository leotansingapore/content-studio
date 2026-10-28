import { describe, expect, it } from "vitest";
import { adviserWordsIn, PROFESSIONS } from "../_shared/adviserWords";
import { HONEST_LINE } from "../_shared/profession";
import { buildBrollMessages, kindQuestions, parseBrollRequest } from "./broll";
import { buildCaptionsMessages, keywordCandidates, keywordQuestion, parseCaptionsRequest, type Keyword } from "./captions";
import { buildHooksMessages, hooksState, parseHooksRequest } from "./hooks";
import {
  buildClipsMessages,
  buildCutawaysMessages,
  buildPublishMessages,
  buildVibeMessages,
  clipQuestions,
  clipViewer,
  parseClipsRequest,
  parseCutawaysRequest,
  parsePublishRequest,
  parseVibeRequest,
} from "./logic";
import { buildMontageMessages, parseMontageRequest } from "./montage";
import { buildPopupMessages, emojiState, keyState, parseMotionRequest } from "./motion";

const SAID = "Most people start too late. Here is the one step that makes the rest easy. Comment START and I will send you the list.";
const KEYWORD: Keyword = { word: "START", verb: "comment" };
const BODIES = [
  { transcript: SAID },
  { transcript: SAID, instagram: "One step today.", title: "Start early", rules: "Use one emoji at most." },
];
const prompts = (extra: Record<string, unknown> = {}) =>
  BODIES.flatMap((b) => {
    const c = parseCaptionsRequest({ ...b, ...extra });
    if (!c.ok) throw new Error(c.error);
    const args = [c.transcript, c.instagram, c.title, c.rules] as const;
    return [
      buildCaptionsMessages(...args, null, c.profession),
      buildCaptionsMessages(...args, KEYWORD, c.profession),
      keywordQuestion(keywordCandidates(c.transcript), c.profession),
    ];
  });

describe("video captions for the brand's profession", () => {
  it("puts the profession in as typed, never read as a replace pattern", () => {
    expect(JSON.stringify(buildCaptionsMessages(SAID, "", "", "", null, "$&-maker"))).toContain("a short video a $&-maker filmed");
  });

  it("a caller that sends no profession, or an adviser's, gets today's prompts and keyword question byte for byte", async () => {
    await expect(JSON.stringify(prompts(), null, 2)).toMatchFileSnapshot("./__pins__/captions-adviser-prompts.json");
    for (const profession of ["", "Financial adviser"]) expect(prompts({ profession })).toEqual(prompts());
  });

  it.each(PROFESSIONS)("$raw gets captions and the keyword question written for them, with none of the adviser words", ({ raw, said }) => {
    const out = prompts({ profession: raw });
    expect(JSON.stringify(out[0])).toContain(`a short video a ${said} filmed`);
    expect(JSON.stringify(out[2])).toContain(`A ${said} says this in a short video.`);
    expect(JSON.stringify(out[0])).toContain("Never invent a number, a result, a client story or a testimonial, and never promise an outcome.");
    expect(adviserWordsIn(JSON.stringify(out))).toEqual([]);
  });
});

describe("the hook card for the brand's profession", () => {
  const LINES = [
    { s: 0, e: 2.5, text: "Most people start too late." },
    { s: 2.5, e: 6, text: "Here is the one step that makes the rest easy." },
  ];
  const FORMULAS = [
    { id: "warning", name: "Warning", template: "Stop doing {thing} before it costs you.", example: "Stop doing this before it costs you.", trap: "A vague threat" },
    { id: "list", name: "List", template: "{N} ways to {thing}", example: "3 ways to start", trap: "Too many points" },
  ];
  const hookPrompts = (extra: Record<string, unknown> = {}) => {
    const h = parseHooksRequest({ sentences: LINES, duration: 6, formulas: FORMULAS, ...extra });
    if (!h.ok) throw new Error(h.error);
    return [buildHooksMessages(h.lines, h.formulas, h.profession), hooksState(["Start today", "One step"], h.lines, h.profession)];
  };

  it("puts the profession in as typed, never read as a replace pattern", () => {
    expect(JSON.stringify(buildHooksMessages(LINES, FORMULAS, "$&-maker"))).toContain("a short video a $&-maker filmed");
  });

  it("a caller that sends no profession, or an adviser's, gets today's prompt and Jev state byte for byte", async () => {
    await expect(JSON.stringify(hookPrompts(), null, 2)).toMatchFileSnapshot("./__pins__/hooks-adviser-prompts.json");
    for (const profession of ["", "Financial adviser"]) expect(hookPrompts({ profession })).toEqual(hookPrompts());
  });

  it.each(PROFESSIONS)("$raw gets hooks written for them, with none of the adviser words", ({ raw, said }) => {
    const out = hookPrompts({ profession: raw });
    expect(JSON.stringify(out[0])).toContain(`a short video a ${said} filmed`);
    expect(JSON.stringify(out[0])).toContain(HONEST_LINE);
    expect(adviserWordsIn(JSON.stringify(out))).toEqual([]);
  });
});

describe("the montage for the brand's profession", () => {
  // Leo's standing rule: stock people and places stay Singaporean by default, whatever the brand does
  const PICTURES = /^Singapore is the default: people are Singaporean or Asian.*$/m;
  const montagePrompts = (extra: Record<string, unknown> = {}) =>
    [{ theme: "Starting your first job", seconds: 30 }, { theme: "Rainy mornings" }].map((b) => {
      const m = parseMontageRequest({ ...b, ...extra });
      if (!m.ok) throw new Error(m.error);
      return buildMontageMessages(m.theme, m.seconds, m.profession);
    });

  it("puts the profession in as typed, never read as a replace pattern", () => {
    expect(buildMontageMessages("Rainy mornings", 30, "$&-maker")[0].content).toContain("a short montage for a $&-maker to post.");
  });

  it("a caller that sends no profession, or an adviser's, gets today's prompt byte for byte", async () => {
    await expect(JSON.stringify(montagePrompts(), null, 2)).toMatchFileSnapshot("./__pins__/montage-adviser-prompts.json");
    for (const profession of ["", "Financial adviser"]) expect(montagePrompts({ profession })).toEqual(montagePrompts());
  });

  it.each(PROFESSIONS)("$raw gets a montage planned for them, with none of the adviser words beyond the picture default", ({ raw, said }) => {
    for (const [system, user] of montagePrompts({ profession: raw })) {
      expect(system.content).toContain(`a short montage for a ${said} to post.`);
      expect(system.content).toContain(HONEST_LINE);
      expect(system.content).toMatch(PICTURES);
      expect(adviserWordsIn(JSON.stringify([system.content.replace(PICTURES, ""), user]))).toEqual([]);
    }
  });
});

describe("pop-ups and key lines for the brand's profession", () => {
  const SENTENCES = [
    { s: 0, e: 3, text: "Most people start too late." },
    { s: 3, e: 7, text: "Here is the one step that makes the rest easy." },
    { s: 7, e: 11, text: "Write down the three things you spend on every week." },
  ];
  const motionPrompts = (extra: Record<string, unknown> = {}) => {
    const m = parseMotionRequest({ sentences: SENTENCES, duration: 11, hookSeconds: 2, ...extra });
    if (!m.ok) throw new Error(m.error);
    return [keyState(m.lines, m.profession), buildPopupMessages(m.lines, [1, 2], m.profession), emojiState(m.profession)];
  };

  it("puts the profession in as typed, never read as a replace pattern", () => {
    expect(buildPopupMessages(SENTENCES, [1], "$&-maker")[0].content).toContain("a short video a $&-maker filmed.");
    expect(keyState(SENTENCES, "$&-maker").video).toContain("filmed by a $&-maker,");
    expect(emojiState("$&-maker").video).toContain("a short video by a $&-maker.");
  });

  it("a caller that sends no profession, or an adviser's, gets today's prompt and Jev states byte for byte", async () => {
    await expect(JSON.stringify(motionPrompts(), null, 2)).toMatchFileSnapshot("./__pins__/motion-adviser-prompts.json");
    for (const profession of ["", "Financial adviser"]) expect(motionPrompts({ profession })).toEqual(motionPrompts());
  });

  it.each(PROFESSIONS)("$raw gets pop-ups and key lines read for them, with none of the adviser words", ({ raw, said }) => {
    const out = motionPrompts({ profession: raw });
    expect(JSON.stringify(out[0])).toContain(`filmed by a ${said}, as a transcript`);
    expect(JSON.stringify(out[1])).toContain(`a short video a ${said} filmed.`);
    expect(JSON.stringify(out[1])).toContain(HONEST_LINE);
    expect(JSON.stringify(out[2])).toContain(`a short video by a ${said}.`);
    expect(adviserWordsIn(JSON.stringify(out))).toEqual([]);
  });
});

describe("B-roll for the brand's profession", () => {
  const SENTENCES = [
    { s: 0, e: 3, text: "Most people start too late." },
    { s: 3, e: 7, text: "My first client had no plan at all." },
    { s: 7, e: 11, text: "We wrote down every bill on one page." },
  ];
  const KINDS_ASKED = { 1: "scene", 2: "idea" } as const;
  const brollPrompts = (extra: Record<string, unknown> = {}) => {
    const b = parseBrollRequest({ sentences: SENTENCES, duration: 11, hookSeconds: 2, taken: [], room: 5, ...extra });
    if (!b.ok) throw new Error(b.error);
    const r = b.request;
    return [keyState(r.lines, r.profession), kindQuestions(r.lines, [1, 2], r.profession), buildBrollMessages(r.lines, [1, 2], KINDS_ASKED, r.profession)];
  };

  it("puts the profession in as typed, never read as a replace pattern", () => {
    expect(buildBrollMessages(SENTENCES, [1], KINDS_ASKED, "$&-maker")[0].content).toContain("a short video a $&-maker filmed.");
  });

  it("a caller that sends no profession, or an adviser's, gets today's prompt and Jev questions byte for byte", async () => {
    await expect(JSON.stringify(brollPrompts(), null, 2)).toMatchFileSnapshot("./__pins__/broll-adviser-prompts.json");
    for (const profession of ["", "Financial adviser"]) expect(brollPrompts({ profession })).toEqual(brollPrompts());
  });

  it.each(PROFESSIONS)("$raw gets B-roll written for them, with none of the adviser words", ({ raw, said }) => {
    const out = brollPrompts({ profession: raw });
    expect(JSON.stringify(out[0])).toContain(`filmed by a ${said}, as a transcript`);
    expect(JSON.stringify(out[2])).toContain(`a short video a ${said} filmed.`);
    expect(JSON.stringify(out[2])).toContain(HONEST_LINE);
    expect(adviserWordsIn(JSON.stringify(out))).toEqual([]);
  });
});

describe("clips for the brand's profession", () => {
  const SENTENCES = Array.from({ length: 12 }, (_, i) => ({ s: i * 6, e: i * 6 + 5.5, text: `Point ${i + 1}: most people start too late, so here is the step that makes it easy.` }));
  const FOUND = [{ start: 0, end: 35.5, title: "Start early", hook: "Most start late", reason: "One clear step." }];
  const clipPrompts = (extra: Record<string, unknown> = {}) =>
    [{}, { about: "starting early", length: "short" }].flatMap((more) => {
      const c = parseClipsRequest({ sentences: SENTENCES, duration: 72, ...more, ...extra });
      if (!c.ok) throw new Error(c.error);
      return [
        buildClipsMessages(c.sentences, c.duration, c.about, undefined, c.length, c.profession),
        buildClipsMessages(c.sentences, c.duration, c.about, { from: 30, to: 72 }, c.length, c.profession),
        { viewer: clipViewer(c.profession) },
        clipQuestions(FOUND, c.sentences, [], c.about, c.profession),
      ];
    });

  it("puts the profession in as typed, never read as a replace pattern", () => {
    expect(buildClipsMessages(SENTENCES, 72, "", undefined, "auto", "$&-maker")[0].content).toContain("a long talking video by a $&-maker (podcast");
    expect(JSON.stringify(clipQuestions(FOUND, SENTENCES, [], "", "$&-maker"))).toContain("a longer talk by a $&-maker and posted");
  });

  it("a caller that sends no profession, or an adviser's, gets today's prompts and Jev questions byte for byte", async () => {
    await expect(JSON.stringify(clipPrompts(), null, 2)).toMatchFileSnapshot("./__pins__/clips-adviser-prompts.json");
    for (const profession of ["", "Financial adviser"]) expect(clipPrompts({ profession })).toEqual(clipPrompts());
  });

  it.each(PROFESSIONS)("$raw gets clips found and scored for them, with none of the adviser words", ({ raw, said }) => {
    const out = clipPrompts({ profession: raw });
    expect(JSON.stringify(out[0])).toContain(`a long talking video by a ${said} (podcast`);
    expect(JSON.stringify(out[0])).toContain(HONEST_LINE);
    expect(JSON.stringify(out[3])).toContain(`a longer talk by a ${said} and posted`);
    expect(adviserWordsIn(JSON.stringify(out))).toEqual([]);
  });
});

describe("callouts, titles and the cover for the brand's profession", () => {
  const SENTENCES = [
    { s: 0, e: 3, text: "Most people start too late." },
    { s: 3, e: 7, text: "Here is the one step that makes the rest easy." },
    { s: 7, e: 11, text: "Write down the three things you spend on every week." },
  ];
  const finishPrompts = (extra: Record<string, unknown> = {}) => {
    const c = parseCutawaysRequest({ sentences: SENTENCES, duration: 11, ...extra });
    const p = parsePublishRequest({ sentences: SENTENCES, duration: 11, ...extra });
    if (!c.ok || !p.ok) throw new Error("bad fixture");
    return [buildCutawaysMessages(c.sentences, c.duration, c.profession), buildPublishMessages(p.sentences, p.duration, p.profession)];
  };

  it("puts the profession in as typed, never read as a replace pattern", () => {
    expect(buildCutawaysMessages(SENTENCES, 11, "$&-maker")[0].content).toContain("a talking-head video a $&-maker filmed:");
    expect(buildPublishMessages(SENTENCES, 11, "$&-maker")[0].content).toContain("a short video a $&-maker filmed,");
  });

  it("a caller that sends no profession, or an adviser's, gets today's prompts byte for byte", async () => {
    await expect(JSON.stringify(finishPrompts(), null, 2)).toMatchFileSnapshot("./__pins__/cutaways-publish-adviser-prompts.json");
    for (const profession of ["", "Financial adviser"]) expect(finishPrompts({ profession })).toEqual(finishPrompts());
  });

  it.each(PROFESSIONS)("$raw gets callouts, titles and a cover written for them, with none of the adviser words", ({ raw, said }) => {
    const [cutaways, publish] = finishPrompts({ profession: raw });
    expect(cutaways[0].content).toContain(`a talking-head video a ${said} filmed:`);
    expect(cutaways[0].content).toContain("that they can film or find");
    expect(publish[0].content).toContain(`a short video a ${said} filmed,`);
    for (const out of [cutaways, publish]) {
      expect(out[0].content).toContain(HONEST_LINE);
      expect(adviserWordsIn(JSON.stringify(out))).toEqual([]);
    }
  });
});

describe("the vibe editor for the brand's profession", () => {
  const FRAME = `data:image/jpeg;base64,${"A".repeat(40)}`;
  const vibePrompts = (extra: Record<string, unknown> = {}) =>
    [
      { instruction: "bigger yellow captions at the top", settings: { style: "bold", size: 1 }, transcript: "Most people start too late.", duration: 12 },
      { instruction: "", settings: {}, transcript: "", duration: 8, frames: [FRAME] },
    ].map((b) => {
      const r = parseVibeRequest({ ...b, ...extra });
      if (!r.ok) throw new Error(r.error);
      return buildVibeMessages(r.request);
    });

  it("puts the profession in as typed, never read as a replace pattern", () => {
    const r = parseVibeRequest({ instruction: "bigger", settings: {}, transcript: "", duration: 5 });
    if (!r.ok) throw new Error(r.error);
    expect(buildVibeMessages({ ...r.request, profession: "$&-maker" })[0].content).toContain("a short-form video editor for a $&-maker.");
  });

  it("a caller that sends no profession, or an adviser's, gets today's prompt byte for byte", async () => {
    await expect(JSON.stringify(vibePrompts(), null, 2)).toMatchFileSnapshot("./__pins__/vibe-adviser-prompts.json");
    for (const profession of ["", "Financial adviser"]) expect(vibePrompts({ profession })).toEqual(vibePrompts());
  });

  it.each(PROFESSIONS)("$raw gets the editor working for them, with none of the adviser words", ({ raw, said }) => {
    const out = vibePrompts({ profession: raw });
    expect(String(out[0][0].content)).toContain(`a short-form video editor for a ${said}.`);
    expect(adviserWordsIn(JSON.stringify(out))).toEqual([]);
  });
});
