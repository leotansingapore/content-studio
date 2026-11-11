// Static ad formats as /image layouts (ff1111, Fastlane's 22 static ads): the image make's prompt for the four ad
// layouts, the memes and the ad versions stays byte for byte (pinned before the static layouts were added), and each
// static layout gets its own rules, response fields and checks.
import { describe, expect, it } from "vitest";
import { AD_LAYOUTS, MEME_LAYOUTS, STATIC_FIELDS, STATIC_LAYOUTS, buildMakePrompt, imageProblem, masText, parseMakeRequest, responseFormat, textFields, validateMake, type MakeResult } from "./logic";

const SOURCE = { key: "ad:2095783381019179", kind: "ad", format: "image", text: "Protect your family today with a plan that grows with you. Get a free quote." };
const BRAND = { name: "Jane Tan", oneLiner: "I help young families plan", audience: "young parents", topics: ["Insurance basics"], facts: "- Ten years advising", mention: true, offer: null, rules: "" };
const BIZ = { ...BRAND, name: "Hilltop Coffee", speaker: "business" };

const req = (b: Record<string, unknown>) => {
  const r = parseMakeRequest({ mode: "make", brand: BRAND, ...b });
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const both = (b: Record<string, unknown>) => {
  const r = req(b);
  return { ...buildMakePrompt(r), format: responseFormat(r) };
};

describe("today's image, meme and ad version prompts", () => {
  it("stay byte for byte", async () => {
    const prompts = [
      ...AD_LAYOUTS.filter((l) => l !== "testimonial").flatMap((layout) => [
        both({ as: "image", layout, topic: "Why a hospital plan has a co-pay" }),
        both({ as: "image", layout, source: SOURCE }),
      ]),
      both({ as: "image", source: SOURCE }),
      both({ as: "image", layout: "testimonial", topic: "Morning coffee", brand: BIZ }),
      both({ as: "image", layout: "headline", topic: "Morning coffee", brand: BIZ }),
      ...MEME_LAYOUTS.map((layout) => both({ as: "meme", layout, topic: "Saving for a flat" })),
      both({ as: "ads", layout: "headline", versions: ["contrarian", "mistake"], topic: "Why a hospital plan has a co-pay" }),
    ];
    await expect(JSON.stringify(prompts, null, 2)).toMatchFileSnapshot("./__pins__/image-prompts.json");
  });
});

describe("static ad formats as image layouts", () => {
  const CAP = { caption: "Afternoons drag. A cold brew in the fridge fixes that.", cta: "Save this for Monday.", hashtags: ["coffee"] };
  // letters, not digits: a digit in the words is the number check's to catch
  const n = (k: number, w = "word") => Array.from({ length: k }, (_, i) => `${w}${"abcdefghijklmnopqrstuvwxyz"[i % 26]}`).join(" ");
  /** Every field of a layout filled within its limit. */
  const filled = (layout: (typeof STATIC_LAYOUTS)[number], k = 2) => Object.fromEntries(Object.entries(STATIC_FIELDS[layout]).map(([f, max]) => [f, n(Math.min(k, max), f)]));
  const image = (layout: (typeof STATIC_LAYOUTS)[number], words: Record<string, string>) => validateMake("image", { refuse: false, reason: "", words, ...CAP }, { layout, brand: req({ as: "image", topic: "x" }).brand }) as Extract<MakeResult, { as: "image" }> | null;

  it("takes each static layout on the image make, never with Jev's pick, and nothing else new", () => {
    for (const layout of STATIC_LAYOUTS) expect(req({ as: "image", layout, topic: "Afternoon coffee" }).layout, layout).toBe(layout);
    expect(parseMakeRequest({ mode: "make", as: "image", layout: "street-scene", topic: "x", brand: BRAND }).ok).toBe(false);
    // a static layout is never a meme or an ad version
    expect(parseMakeRequest({ mode: "make", as: "meme", layout: "text-chat", topic: "x", brand: BRAND }).ok).toBe(false);
    expect(parseMakeRequest({ mode: "make", as: "ads", layout: "text-chat", versions: ["contrarian", "mistake"], topic: "x", brand: BRAND }).ok).toBe(false);
  });

  it("writes each layout from its own rules: what it is, every field with its limit, and the image rules", () => {
    for (const layout of STATIC_LAYOUTS) {
      const { system } = buildMakePrompt(req({ as: "image", layout, topic: "Afternoon coffee" }));
      expect(system, layout).toContain("Write the words for one static ad picture. It is ");
      for (const [f, max] of Object.entries(STATIC_FIELDS[layout])) {
        expect(system, `${layout} ${f}`).toContain(`words.${f}`);
        expect(system, `${layout} ${f}`).toContain(`at most ${max} words`);
      }
      expect(system, layout).toContain("- Never put a number in the words: no figures, prices, percentages or counts.");
      expect(system, layout).toContain("never write a result, a promise or a customer's story the facts don't hold.");
      expect(system, layout).not.toContain("Its layout is a picture with a headline");
      expect(system, layout).not.toContain("Leave every other words field empty.");
    }
    const remix = buildMakePrompt(req({ as: "image", layout: "forum-thread", source: SOURCE })).system;
    expect(remix).toContain("no run of 4 or more words from it");
    expect(buildMakePrompt(req({ as: "image", layout: "forum-thread", brand: BIZ, topic: "x" })).system).toContain("You help a business in Singapore");
  });

  it("asks the model for exactly the layout's fields", () => {
    for (const layout of STATIC_LAYOUTS) {
      const words = (responseFormat(req({ as: "image", layout, topic: "x" })) as { json_schema: { schema: { properties: { words: { required: string[]; properties: Record<string, { description: string }> } } } } }).json_schema.schema.properties.words;
      expect(words.required, layout).toEqual(Object.keys(STATIC_FIELDS[layout]));
      for (const [f, max] of Object.entries(STATIC_FIELDS[layout])) expect(words.properties[f].description, `${layout} ${f}`).toBe(`At most ${max} words`);
    }
  });

  it("keeps a layout's words within their limits, refuses one over or missing, and drops stray fields", () => {
    for (const layout of STATIC_LAYOUTS) {
      const words = filled(layout);
      expect(image(layout, { ...words, headlineX: "stray" }), layout).toMatchObject({ as: "image", layout, layoutBy: "default", words });
      for (const [f, max] of Object.entries(STATIC_FIELDS[layout])) {
        expect(image(layout, { ...words, [f]: n(max + 1) }), `${layout} ${f} over`).toBeNull();
        expect(image(layout, { ...words, [f]: "" }), `${layout} ${f} empty`).toBeNull();
      }
    }
  });

  it("never lets a made-up person speak as an adviser's client, and leaves a business's formats as they were", () => {
    const system = (layout: string, brand: Record<string, unknown> = BRAND) => buildMakePrompt(req({ as: "image", layout, topic: "Afternoon coffee", brand })).system;
    const CLIENT = "- Nobody in the picture is the adviser's client or speaks as one";
    // what a business's chat formats say, which for an adviser would be an invented testimonial
    const AS_A_USER = ["as what they use for it", "the other recommends the brand", "the assistant's reply recommends the brand", "a reply from another member that recommends the brand", "saying why they use the brand", "shared to the buyer's phone by a friend", "a small confession about a familiar struggle"];
    for (const layout of STATIC_LAYOUTS) {
      const person = system(layout);
      expect(person, layout).toContain(CLIENT);
      expect(person, layout).toContain("never a full name, a job title or a company");
      for (const said of AS_A_USER) expect(person, `${layout}: ${said}`).not.toContain(said);
      // the compliance block every adviser prompt carries: no named insurer products, no promised returns
      expect(person, layout).toContain("no named insurer products");
      // each field is still told, with its limit
      for (const [f, max] of Object.entries(STATIC_FIELDS[layout])) expect(person, `${layout} ${f}`).toMatch(new RegExp(`words\\.${f}\\b[^\\n]*at most ${max} words|words\\.${f}\\b[^\\n]*\\n?[^\\n]*at most ${max} words`));
      const business = system(layout, BIZ);
      expect(business, layout).not.toContain("is the adviser's client");
      expect(business, layout).not.toContain("the adviser");
      // someone else's words keep their own voice, so a business's "never write I" stays the brand's own rule
      for (const p of [person, business]) expect(p, layout).toContain("- Words said by someone other than the brand");
    }
    for (const layout of ["text-chat", "friend-recommends", "ai-chat", "forum-thread", "phone-share", "tshirt-print"]) expect(system(layout), layout).toMatch(/never says they are (a|the adviser's) client|never rates, ranks or praises/);
    expect(AS_A_USER.filter((said) => STATIC_LAYOUTS.some((l) => system(l, BIZ).includes(said)))).toEqual(AS_A_USER);
    // a person in any other work gets the same guard in their own words, with no adviser in it
    const coach = system("friend-recommends", { ...BRAND, profession: "Coach" });
    expect(coach).toContain("is the coach's client or speaks as one");
    expect(coach).not.toContain("adviser");
  });

  it("leaves the brand's name out when the make says not to name it (Post choices: Never)", () => {
    const OFF = "- This picture does not name the brand";
    for (const layout of STATIC_LAYOUTS) {
      for (const brand of [BRAND, BIZ]) {
        expect(buildMakePrompt(req({ as: "image", layout, topic: "x", brand: { ...brand, mention: false } })).system, layout).toContain(OFF);
        expect(buildMakePrompt(req({ as: "image", layout, topic: "x", brand })).system, layout).not.toContain(OFF);
      }
    }
    expect(buildMakePrompt(req({ as: "image", layout: "text-chat", topic: "x", brand: { ...BIZ, mention: false } })).system).toContain("Do not name Hilltop Coffee or any product.");
  });

  it("sends a number back once, and reads every field for the copy and MAS checks", () => {
    const chat = image("text-chat", { ...filled("text-chat"), four: "see you at 9 then" })!;
    expect(imageProblem(chat, { source: undefined })?.kind).toBe("number");
    const ok = image("ai-chat", filled("ai-chat"))!;
    expect(imageProblem(ok, { source: undefined })).toBeNull();
    expect(textFields(ok)).toEqual([...Object.values(filled("ai-chat")), ok.caption]);
    expect(masText(ok)).toContain("questiona");
  });
});
