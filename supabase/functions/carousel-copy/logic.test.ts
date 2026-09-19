import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BODY_MAX_WORDS,
  CAROUSEL_RESPONSE_FORMAT,
  MAX_SLIDES,
  OPENAI_MODEL,
  buildCarouselPrompt,
  buildOpenAiBody,
  messageContent,
  parseCarouselRequest,
  validateCarouselCopy,
} from "./logic";

const slides = [
  { title: "Most people think insurance is expensive", body: "" },
  { title: "It isn't", body: "What's expensive is finding out you're not covered." },
  { title: "DM me REVIEW", body: "I'll send you my checklist." },
];

describe("parseCarouselRequest", () => {
  it("accepts slides, trims them and defaults the platform to Instagram", () => {
    const parsed = parseCarouselRequest({ slides: [{ title: "  Hook ", body: " " }, { title: "", body: "Point" }] });
    expect(parsed).toEqual({
      ok: true,
      request: { platform: "instagram", slides: [{ title: "Hook", body: "" }, { title: "", body: "Point" }] },
    });
    const li = parseCarouselRequest({ slides, platform: "linkedin" });
    expect(li.ok && li.request.platform).toBe("linkedin");
  });

  it("refuses bad requests with a message the consultant can act on", () => {
    expect(parseCarouselRequest(null)).toMatchObject({ ok: false });
    expect(parseCarouselRequest({ slides: [slides[0]] })).toMatchObject({ ok: false, error: "Send at least 2 slides." });
    expect(parseCarouselRequest({ slides: Array(MAX_SLIDES + 1).fill(slides[1]) })).toMatchObject({ ok: false });
    expect(parseCarouselRequest({ slides: [slides[0], { title: " ", body: "" }] })).toMatchObject({
      ok: false,
      error: "Slide 2 is empty. Add text or delete it.",
    });
    expect(parseCarouselRequest({ slides: [slides[0], { title: "x".repeat(201), body: "" }] })).toMatchObject({
      ok: false,
    });
    expect(parseCarouselRequest({ slides: [slides[0], "not a slide"] })).toMatchObject({ ok: false });
  });
});

describe("prompt and request body", () => {
  it("asks for the same slide count, keeps roles and states the MAS rules", () => {
    const { system, user } = buildCarouselPrompt({ slides, platform: "instagram" });
    expect(system).toContain("exactly 3 slides");
    expect(system).toContain("Instagram");
    expect(system).toMatch(/guarantee/);
    expect(system).toMatch(/risk-free/);
    const sent = JSON.parse(user.slice(user.indexOf("[")));
    expect(sent.map((s: { role: string }) => s.role)).toEqual(["cover", "point", "call to action"]);
    expect(sent[1].body).toBe(slides[1].body);
  });

  it("uses gpt-4.1 with a strict JSON schema", () => {
    const body = buildOpenAiBody({ system: "s", user: "u" });
    expect(body.model).toBe(OPENAI_MODEL);
    expect(OPENAI_MODEL).toBe("gpt-4.1");
    expect(body.response_format).toBe(CAROUSEL_RESPONSE_FORMAT);
    const schema = CAROUSEL_RESPONSE_FORMAT.json_schema;
    expect(schema.strict).toBe(true);
    expect(schema.schema.required).toEqual(["slides"]);
    expect(schema.schema.properties.slides.items.required).toEqual(["title", "body"]);
    expect(schema.schema.properties.slides.items.additionalProperties).toBe(false);
    expect(body.messages).toEqual([
      { role: "system", content: "s" },
      { role: "user", content: "u" },
    ]);
  });
});

describe("messageContent", () => {
  it("returns the reply, or null when refused or missing", () => {
    expect(messageContent({ choices: [{ message: { content: '{"slides":[]}' } }] })).toBe('{"slides":[]}');
    expect(messageContent({ choices: [{ message: { content: null, refusal: "no" } }] })).toBeNull();
    expect(messageContent({})).toBeNull();
    expect(messageContent(null)).toBeNull();
  });
});

describe("validateCarouselCopy", () => {
  const reply = (s: unknown) => JSON.stringify({ slides: s });

  it("keeps one tidy slide per slide sent", () => {
    const out = validateCarouselCopy(
      reply([
        { title: "Slide 1: **Insurance isn't expensive.**", body: "" },
        { title: "Not being covered is", body: "That's the real cost. #insurance #sg" },
        { title: "DM me REVIEW", body: "Get my free checklist." },
      ]),
      3,
    );
    expect(out).toEqual([
      { title: "Insurance isn't expensive", body: "" },
      { title: "Not being covered is", body: "That's the real cost." },
      { title: "DM me REVIEW", body: "Get my free checklist." },
    ]);
  });

  it("rejects the wrong number of slides, bad JSON and empty slides", () => {
    expect(validateCarouselCopy(reply(slides.slice(0, 2)), 3)).toBeNull();
    expect(validateCarouselCopy("not json", 3)).toBeNull();
    expect(validateCarouselCopy(null, 3)).toBeNull();
    expect(validateCarouselCopy(reply([...slides.slice(0, 2), { title: " ", body: "" }]), 3)).toBeNull();
    expect(validateCarouselCopy(JSON.stringify({ nope: [] }), 3)).toBeNull();
  });

  it("caps an over-long body", () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const out = validateCarouselCopy(reply([slides[0], { title: "Point", body: long }]), 2);
    expect(out?.[1].body.split(/\s+/).length).toBeLessThanOrEqual(BODY_MAX_WORDS);
    expect(out?.[1].body.endsWith("…")).toBe(true);
  });
});

describe("carousel-copy handler", () => {
  it("counts the daily cap before it calls OpenAI", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const consume = source.indexOf('consumeUsage(admin, uid, "carousel")');
    const refusal = source.indexOf("usageRefusal(usage)");
    const openai = source.indexOf("api.openai.com");
    expect(consume).toBeGreaterThan(0);
    expect(refusal).toBeGreaterThan(consume);
    expect(openai).toBeGreaterThan(refusal);
    expect(source).toContain('from "../_shared/usageCaps.ts"');
  });
});
