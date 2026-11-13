import { describe, expect, it } from "vitest";
import { MAX_REF_CHARS, PEOPLE_RULE, WORDS_FLAT_RULE, WORDS_PEOPLE_RULE, buildFixBody, buildImageBody, pictureUrl, jobToken, openJobToken, parseImageRequest, readStatus, tokenSecret } from "./logic";
import { REF_LINES, WORDS_SIZE, gptFixBody, gptImageBody, gptRefBody } from "./openai";

// The people rule every picture without words has always carried, pinned byte for byte before the words flag joined it.
const RULE_BEFORE_WORDS =
  "Set in Singapore. Any people shown are Singaporean or other Asian (a natural mix of Chinese, Malay, Indian and Eurasian), " +
  "each one clearly different from the others in age, build, face, hair and clothes; good-looking, well-groomed, natural expressions. " +
  "Polished lifestyle photograph. No text, no words, no logos, no watermarks.";

describe("parseImageRequest", () => {
  it("starts a job from a tidied prompt", () => {
    expect(parseImageRequest({ mode: "start", prompt: "  A couple   at an HDB dining table  " })).toEqual({
      ok: true,
      request: { mode: "start", prompt: "A couple at an HDB dining table" },
    });
    expect(parseImageRequest({ prompt: "A couple at an HDB dining table" })).toMatchObject({ ok: true, request: { mode: "start" } });
  });

  it("keeps the words flag only when it is exactly true", () => {
    expect(parseImageRequest({ mode: "start", prompt: "A poster at a bus shelter", words: true })).toEqual({ ok: true, request: { mode: "start", prompt: "A poster at a bus shelter", words: true } });
    for (const words of ["true", 1, "yes", null, false]) {
      expect(parseImageRequest({ mode: "start", prompt: "A poster at a bus shelter", words })).toEqual({ ok: true, request: { mode: "start", prompt: "A poster at a bus shelter" } });
    }
  });

  it("refuses a short or overlong prompt and a status id that isn't a UUID", () => {
    expect(parseImageRequest({ prompt: "cat" })).toMatchObject({ ok: false });
    expect(parseImageRequest({ prompt: "x".repeat(1201) })).toMatchObject({ ok: false });
    expect(parseImageRequest({ mode: "status" })).toMatchObject({ ok: false });
    expect(parseImageRequest({ mode: "status", token: "x".repeat(121) })).toMatchObject({ ok: false });
    expect(parseImageRequest({ mode: "status", token: "abc.def" })).toEqual({ ok: true, request: { mode: "status", token: "abc.def" } });
  });
});

describe("buildImageBody", () => {
  it("adds the Singapore people rule and asks for one 3:4 1080p picture", () => {
    const body = buildImageBody("A couple at an HDB dining table");
    expect(body).toMatchObject({ aspect_ratio: "3:4", resolution: "1080p", batch_size: 1 });
    expect(body.prompt).toBe(`A couple at an HDB dining table\n\n${PEOPLE_RULE}`);
    expect(PEOPLE_RULE).toMatch(/Singapore/);
    expect(PEOPLE_RULE).toMatch(/clearly different from the others/);
  });

  it("sends every existing caller's prompt byte for byte as before the words flag", () => {
    expect(PEOPLE_RULE).toBe(RULE_BEFORE_WORDS);
    expect(buildImageBody("A couple at an HDB dining table")).toEqual({ prompt: `A couple at an HDB dining table\n\n${RULE_BEFORE_WORDS}`, aspect_ratio: "3:4", resolution: "1080p", batch_size: 1 });
    expect(gptImageBody("A couple at an HDB dining table", "u1")).toEqual({
      model: "gpt-image-2.6-flare",
      prompt: `A couple at an HDB dining table\n\n${RULE_BEFORE_WORDS}`,
      size: "1152x1536",
      quality: "medium",
      output_format: "jpeg",
      output_compression: 90,
      n: 1,
      safety_identifier: "u1",
    });
  });
});

describe("a picture that carries words", () => {
  it("gets the people rule without its No text clause and the native 4:5 size, and nothing else changes", () => {
    const body = gptImageBody("A poster at a bus shelter", "u1", true);
    expect(body.prompt).toBe(`A poster at a bus shelter\n\n${WORDS_PEOPLE_RULE}`);
    expect(body.prompt).not.toMatch(/No text|no words|no logos/);
    // every picture without words keeps the rule it always had
    expect(PEOPLE_RULE).toBe(RULE_BEFORE_WORDS);
    const { prompt: _a, ...rest } = body;
    const { prompt: _b, ...plain } = gptImageBody("A poster at a bus shelter", "u1");
    expect(rest).toEqual({ ...plain, size: "1152x1440" });
    expect(plain.size).toBe("1152x1536");
  });

  it("asks for a 4:5 size the docs allow: both edges multiples of 16, inside 1:3 to 3:1, 655,360 to 8,294,400 pixels, under 2560x1440", () => {
    const [w, h] = WORDS_SIZE.split("x").map(Number);
    expect(w / h).toBe(4 / 5);
    expect([w % 16, h % 16]).toEqual([0, 0]);
    expect(w * h).toBeGreaterThanOrEqual(655_360);
    expect(w * h).toBeLessThanOrEqual(2560 * 1440);
  });

  it("keeps a photo ad's fix at 4:5 too, and every other fix as it was", () => {
    expect(parseImageRequest({ mode: "fix", token: "t", fix: "make the sky bluer", words: true })).toEqual({ ok: true, request: { mode: "fix", token: "t", fix: "make the sky bluer", words: true } });
    expect(parseImageRequest({ mode: "fix", token: "t", fix: "make the sky bluer", words: "yes" })).toEqual({ ok: true, request: { mode: "fix", token: "t", fix: "make the sky bluer" } });
    expect(gptFixBody("https://x/p.jpg", "make the sky bluer", "u1", true)).toEqual({ ...gptFixBody("https://x/p.jpg", "make the sky bluer", "u1"), size: "1152x1440" });
    expect(gptRefBody("A poster", "u1", { logo: "data:image/png;base64,iVBORw0KGgo=" }).size).toBe("1152x1440");
  });
});

describe("people in a picture that carries words", () => {
  it("come only where the scene calls for them, one or two adults in an everyday moment, never a posed group or a polished look", () => {
    expect(WORDS_PEOPLE_RULE).toContain("People only where the scene calls for them: one or two adults at most, Singaporean or other Asian");
    expect(WORDS_PEOPLE_RULE).toContain("never a posed group around a phone");
    expect(WORDS_PEOPLE_RULE).not.toMatch(/good-looking|well-groomed|lifestyle|natural mix|clearly different/);
    expect(gptImageBody("A poster", "u1", true).prompt).toBe(`A poster\n\n${WORDS_PEOPLE_RULE}`);
    expect(gptImageBody("A poster", "u1").prompt).toBe(`A poster\n\n${RULE_BEFORE_WORDS}`);
  });
});

describe("the setting of a picture that carries words", () => {
  it("is Singapore through ordinary cues, never a landmark, a skyline icon or a real business's mark", () => {
    expect(WORDS_PEOPLE_RULE).toMatch(/^Where the scene has a setting it is Singapore, shown through ordinary cues: HDB blocks, void decks, kopitiam tables, covered walkways, greenery, local shopfronts with no real names\./);
    for (const icon of ["Marina Bay Sands", "ArtScience Museum", "Merlion", "Gardens by the Bay", "Singapore Flyer", "CBD skyline"]) expect(WORDS_PEOPLE_RULE).toContain(icon);
    expect(WORDS_PEOPLE_RULE).toContain("No famous landmarks or skyline icons");
    expect(WORDS_PEOPLE_RULE).toContain("No real place names, transit, mall, bank or shop logos, or vehicle liveries.");
  });
});

describe("a type-only photo ad (flat)", () => {
  it("is read only with the words flag, and gets the no-photo rule in place of the setting and people rule, logo or not", () => {
    expect(parseImageRequest({ mode: "start", prompt: "A type-only apology", words: true, flat: true })).toEqual({ ok: true, request: { mode: "start", prompt: "A type-only apology", words: true, flat: true } });
    expect(parseImageRequest({ mode: "start", prompt: "A type-only apology", flat: true })).toEqual({ ok: true, request: { mode: "start", prompt: "A type-only apology" } });
    expect(parseImageRequest({ mode: "start", prompt: "A type-only apology", words: true, flat: "yes" })).toEqual({ ok: true, request: { mode: "start", prompt: "A type-only apology", words: true } });
    expect(gptImageBody("A card", "u1", true, true).prompt).toBe(`A card\n\n${WORDS_FLAT_RULE}`);
    expect(gptRefBody("A card", "u1", { logo: "data:image/png;base64,iVBORw0KGgo=" }, true).prompt).toBe(`A card\n\nThe picture given ${REF_LINES.logo}\n\n${WORDS_FLAT_RULE}`);
    expect(WORDS_FLAT_RULE).toBe("A flat design: no photograph, no people and no product picture anywhere in it.");
    // flat means nothing without words: every other picture keeps its rule
    expect(gptImageBody("A card", "u1", false, true).prompt).toBe(`A card\n\n${PEOPLE_RULE}`);
  });
});

describe("readStatus", () => {
  it("maps Higgsfield's states", () => {
    expect(readStatus({ status: "queued" })).toEqual({ state: "working" });
    expect(readStatus({ status: "in_progress" })).toEqual({ state: "working" });
    expect(readStatus({ status: "completed", images: [{ url: "https://d3u0tzju9qaucj.cloudfront.net/a/b.png" }] })).toEqual({
      state: "done",
      url: "https://d3u0tzju9qaucj.cloudfront.net/a/b.png",
    });
    expect(readStatus({ status: "nsfw" })).toMatchObject({ state: "failed", error: expect.stringMatching(/safety filter/) });
    expect(readStatus({ status: "failed" })).toMatchObject({ state: "failed" });
    expect(readStatus(null)).toMatchObject({ state: "failed" });
  });

  it("never calls a job done without an https picture", () => {
    expect(readStatus({ status: "completed", images: [] })).toMatchObject({ state: "failed" });
    expect(readStatus({ status: "completed", images: [{ url: "javascript:alert(1)" }] })).toMatchObject({ state: "failed" });
  });
});

describe("job tokens", () => {
  const id = "4caa5951-46ae-4d65-9f8f-7b05dd4207cb";

  it("opens only for the adviser it was made for", async () => {
    const secret = await tokenSecret("service-role-key");
    const forA = await jobToken(secret, "user-a", id.toUpperCase());
    expect(forA.startsWith(`${id}.`)).toBe(true);
    expect(await openJobToken(secret, "user-a", forA)).toBe(id);
    expect(await openJobToken(secret, "user-b", forA)).toBeNull();
  });

  it("refuses a bare id, a tampered signature and another server's token", async () => {
    const secret = await tokenSecret("service-role-key");
    const forA = await jobToken(secret, "user-a", id);
    expect(await openJobToken(secret, "user-a", id)).toBeNull();
    expect(await openJobToken(secret, "user-a", `${forA.slice(0, -1)}${forA.endsWith("0") ? "1" : "0"}`)).toBeNull();
    const other = await jobToken(await tokenSecret("another-key"), "user-a", id);
    expect(await openJobToken(secret, "user-a", other)).toBeNull();
  });
});

describe("fix mode", () => {
  it("takes a token and a tidied fix, and refuses a missing, short or long one", () => {
    expect(parseImageRequest({ mode: "fix", token: "abc.def", fix: "  remove the   text on the sign " })).toEqual({
      ok: true,
      request: { mode: "fix", token: "abc.def", fix: "remove the text on the sign" },
    });
    expect(parseImageRequest({ mode: "fix", fix: "remove the text" })).toMatchObject({ ok: false });
    expect(parseImageRequest({ mode: "fix", token: "abc.def", fix: "no" })).toMatchObject({ ok: false });
    expect(parseImageRequest({ mode: "fix", token: "abc.def", fix: "x".repeat(301) })).toMatchObject({ ok: false });
  });

  it("edits the one picture at 3:4 and keeps the rest", () => {
    const body = buildFixBody("https://cdn.example/a.png", "fix the hands");
    expect(body).toMatchObject({ image_urls: ["https://cdn.example/a.png"], aspect_ratio: "3:4", resolution: "2k" });
    expect(String(body.prompt)).toMatch(/^fix the hands\n\nChange only what is asked/);
  });

  it("only a finished picture can be fixed, never a B-roll video", () => {
    expect(pictureUrl({ status: "completed", images: [{ url: "https://cdn.example/a.png" }] })).toBe("https://cdn.example/a.png");
    expect(pictureUrl({ status: "completed", video: { url: "https://cdn.example/a.mp4" } })).toBeNull();
    expect(pictureUrl({ status: "in_progress" })).toBeNull();
    expect(pictureUrl({ status: "completed", images: [{ url: "http://cdn.example/a.png" }] })).toBeNull();
  });
});

describe("a photo ad's reference pictures", () => {
  const LOGO = "data:image/png;base64,iVBORw0KGgo=";
  const ask = (refs: unknown, words: unknown = true) => parseImageRequest({ mode: "start", prompt: "A poster at a bus shelter", words, refs });

  it("keeps the brand's logo only with the words flag, and only as a picture's data URL within its limit", () => {
    expect(ask({ logo: LOGO })).toEqual({ ok: true, request: { mode: "start", prompt: "A poster at a bus shelter", words: true, refs: { logo: LOGO } } });
    expect(ask({ logo: "data:image/webp;base64,UklGRg==" })).toMatchObject({ request: { refs: { logo: "data:image/webp;base64,UklGRg==" } } });
    // without the words flag a start is today's, refs and all left out
    expect(ask({ logo: LOGO }, false)).toEqual({ ok: true, request: { mode: "start", prompt: "A poster at a bus shelter" } });
    for (const logo of ["https://example.com/logo.png", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,<script>", `data:image/png;base64,${"A".repeat(MAX_REF_CHARS)}`, 7]) {
      expect(ask({ logo }), String(logo).slice(0, 30)).toEqual({ ok: true, request: { mode: "start", prompt: "A poster at a bus shelter", words: true } });
    }
    expect(ask("logo")).toEqual({ ok: true, request: { mode: "start", prompt: "A poster at a bus shelter", words: true } });
  });

  it("takes the product's picture beside the logo, the logo first and each said by its place", () => {
    const PIC = "data:image/jpeg;base64,/9j/4AAQ";
    expect(ask({ product: PIC, logo: LOGO, other: PIC })).toMatchObject({ request: { refs: { logo: LOGO, product: PIC } } });
    expect(Object.keys((ask({ product: PIC, other: PIC }) as { request: { refs: object } }).request.refs)).toEqual(["product"]);
    const both = gptRefBody("A poster at a bus shelter", "u1", { product: PIC, logo: LOGO });
    expect(both.images).toEqual([{ image_url: LOGO }, { image_url: PIC }]);
    expect(both.prompt).toBe(`A poster at a bus shelter\n\nThe first picture given ${REF_LINES.logo}\n\nThe second picture given ${REF_LINES.product}\n\n${WORDS_PEOPLE_RULE}`);
    expect(gptRefBody("A poster at a bus shelter", "u1", { product: PIC }).prompt).toBe(`A poster at a bus shelter\n\nThe picture given ${REF_LINES.product}\n\n${WORDS_PEOPLE_RULE}`);
  });

  it("goes to GPT Image as an edit's one picture, said once after the prompt, before the people rule without No text", () => {
    const body = gptRefBody("A poster at a bus shelter", "u1", { logo: LOGO });
    expect(body).toEqual({ ...gptImageBody("A poster at a bus shelter", "u1", true), prompt: body.prompt, images: [{ image_url: LOGO }] });
    expect(body.prompt).toBe(`A poster at a bus shelter\n\nThe picture given ${REF_LINES.logo}\n\n${WORDS_PEOPLE_RULE}`);
    expect(REF_LINES.logo).toMatch(/exact logo on the ad once, unaltered/);
  });
});
