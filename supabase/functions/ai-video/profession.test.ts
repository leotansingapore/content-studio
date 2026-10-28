import { describe, expect, it } from "vitest";
import { adviserWordsIn, PROFESSIONS } from "../_shared/adviserWords";
import { parseVideoRequest, scriptPrompt } from "./logic";
import { editorTemplates, templateById, templateDetails, templateSystem } from "./templates";

// Leo's standing rule: AI people are Singaporean by default, whatever the brand does (kept, so not an adviser word here)
const SCRIPT_PEOPLE = "people are Singaporean (Chinese, Malay, Indian or Eurasian)";
const CLIP_PEOPLE = "People: set in Singapore and, unless the details say otherwise, Singaporean or other Asian (Chinese, Malay, Indian or Eurasian), each clearly different from the others.";

const TOPIC = "Three things to check before you start";
const scriptPrompts = (extra: Record<string, unknown> = {}) => {
  const r = parseVideoRequest({ mode: "script", topic: TOPIC, ...extra });
  if (!r.ok || r.request.mode !== "script") throw new Error("bad fixture");
  return [scriptPrompt(r.request)];
};

describe("the explainer script for the brand's profession", () => {
  it("puts the profession in as typed, never read as a replace pattern", () => {
    expect(scriptPrompt({ topic: TOPIC, profession: "$&-maker" }).system).toContain("You write short explainer videos for a $&-maker to post");
  });

  it("a caller that sends no profession, or an adviser's, gets today's prompt byte for byte", async () => {
    await expect(JSON.stringify(scriptPrompts(), null, 2)).toMatchFileSnapshot("./__pins__/script-adviser-prompts.json");
    for (const profession of ["", "Financial adviser"]) expect(scriptPrompts({ profession })).toEqual(scriptPrompts());
  });

  it.each(PROFESSIONS)("$raw gets an explainer written for them, with none of the adviser words", ({ raw, said }) => {
    for (const p of scriptPrompts({ profession: raw })) {
      expect(p.system).toContain(`You write short explainer videos for a ${said} to post on Reels, TikTok and Shorts.`);
      expect(p.system).toContain("Never invent a number, a result, a client story or a testimonial, and never promise an outcome.");
      expect(p.system).toContain(SCRIPT_PEOPLE);
      expect(adviserWordsIn(JSON.stringify(p).replace(SCRIPT_PEOPLE, ""))).toEqual([]);
    }
  });
});

const PHOTO = "/9j/4AAQSkZJRgABAQAAAQABAAD";
const FIELDS = { product: "A steel water bottle", person: "A woman in her 30s", scene: "A morning walk", line: "Cold all day", question: "Where do you start?", answer: "Small" };
// every template anyone may pick in the editor, with no photo and with each photo it takes
const TEMPLATE_BODIES = editorTemplates(false).flatMap((t) =>
  [null, ...t.photos]
    .filter((role) => role || !t.needsPhoto)
    .map((role) => ({ mode: "template", template: t.id, seconds: 8, quality: "480p", fields: FIELDS, photos: role ? [{ role, jpeg: PHOTO }] : [] })),
);
const templatePrompts = (extra: Record<string, unknown> = {}, bodies: Record<string, unknown>[] = TEMPLATE_BODIES) =>
  bodies.map((b) => {
    const r = parseVideoRequest({ ...b, ...extra });
    if (!r.ok || r.request.mode !== "template") throw new Error(`bad fixture ${b.template}`);
    const t = templateById(r.request.template)!;
    return { system: templateSystem(t, r.request.seconds, r.request.photos[0]?.role ?? null, r.request.profession), user: templateDetails(t, r.request.fields) };
  });

describe("a template clip's prompt writer for the brand's profession", () => {
  it("puts the profession in as typed, never read as a replace pattern", () => {
    expect(templateSystem(templateById("food-asmr")!, 8, null, "$&-maker")).toContain("a short vertical clip that a $&-maker posts on Reels");
  });

  it("a caller that sends no profession, or an adviser's, gets today's prompts byte for byte", async () => {
    expect(TEMPLATE_BODIES.length).toBeGreaterThan(8);
    await expect(JSON.stringify(templatePrompts(), null, 2)).toMatchFileSnapshot("./__pins__/templates-adviser-prompts.json");
    for (const profession of ["", "Financial adviser"]) expect(templatePrompts({ profession })).toEqual(templatePrompts());
  });

  it.each(PROFESSIONS)("$raw gets every editor template's prompt written for them, with none of the adviser words", ({ raw, said }) => {
    for (const p of templatePrompts({ profession: raw })) {
      expect(p.system).toContain(`a short vertical clip that a ${said} posts on Reels, TikTok and Shorts.`);
      expect(p.system).toContain(CLIP_PEOPLE);
      expect(adviserWordsIn(JSON.stringify(p).replace(CLIP_PEOPLE, ""))).toEqual([]);
    }
    const spoken = templatePrompts({ profession: raw }).find((p) => p.system.includes("Spoken lines:"))!.system;
    expect(spoken).toContain("Never invent a number, a result, a client story or a testimonial, and never promise an outcome.");
  });

  it("a hidden or Leo-only template keeps today's prompt whatever the brand does", () => {
    const leo = [
      { mode: "template", template: "spoken-hook", seconds: 4, quality: "480p", fields: { line: "Stop guessing" } },
      { mode: "template", template: "street-interview", seconds: 8, quality: "480p", fields: { question: "How much do you save?" } },
    ];
    expect(templatePrompts({ profession: "Coach" }, leo)).toEqual(templatePrompts({}, leo));
  });
});
