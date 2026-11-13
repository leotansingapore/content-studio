// Static ad formats as /image layouts (ff1111, Fastlane's 22 static ads): the image make's prompt for the four ad
// layouts, the memes and the ad versions stays byte for byte (pinned before the static layouts were added), and each
// static layout gets its own rules, response fields and checks.
import { describe, expect, it } from "vitest";
import { STATIC_FORMATS, STATIC_SHOTS } from "../../../src/data/staticFormats";
import { AD_LAYOUTS, MEME_LAYOUTS, STATIC_ANGLES, STATIC_FIELDS, STATIC_LAYOUTS, angleQuestion, angleState, buildMakePrompt, pickAngle, pickSubject, shapeFix, subjectQuestion, imageProblem, masText, parseMakeRequest, responseFormat, textFields, validateMake, type MakeResult } from "./logic";

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

// Every static layout's prompt and response shape as a request without a product or angles builds it (the drawn make,
// the agent's layout make and a photo make from an older app), pinned before those joined the image make.
describe("today's static layout prompts", () => {
  it("stay byte for byte", async () => {
    const prompts = STATIC_LAYOUTS.flatMap((layout) => [
      both({ as: "image", layout, topic: "Afternoon coffee", brand: BIZ }),
      both({ as: "image", layout, topic: "Why a hospital plan has a co-pay" }),
      both({ as: "image", layout, source: SOURCE, brand: BIZ }),
    ]);
    await expect(JSON.stringify(prompts, null, 2)).toMatchFileSnapshot("./__pins__/static-prompts.json");
  });
});

describe("a static ad about one product", () => {
  const PRODUCT = { name: "Activity Tracker", what: "Logs daily sales activities as streaks, with a leaderboard.", forWho: "Sales agents" };

  it("puts the product's facts first among the brand's and tells the writer to name it and one thing it does", () => {
    const r = req({ as: "image", layout: "street-poster", topic: "Prospecting", brand: BIZ, product: PRODUCT });
    expect(r.product).toEqual(PRODUCT);
    expect(r.brand.facts).toBe("- The product this ad is about: Activity Tracker\n- What Activity Tracker is: Logs daily sales activities as streaks, with a leaderboard.\n- Who Activity Tracker is for: Sales agents\n- Ten years advising");
    const { system } = buildMakePrompt(r);
    expect(system).toContain("- The ad is about Activity Tracker, from the facts given. Name it once, in the line that says what the brand does, with one concrete thing it does, never a general line about the brand. Every field keeps its word limit: use the product's shortest name, and leave the brand's name out of that line before going over.");
    expect(system).toContain("- What Activity Tracker is: Logs daily sales activities as streaks");
  });

  it("is only for a static layout, needs a name, and is never named when the make doesn't name the brand", () => {
    for (const b of [{ as: "image", layout: "headline", topic: "x" }, { as: "meme", layout: "pov", topic: "x" }, { as: "image", layout: "street-poster", topic: "x", product: { what: "no name" } }]) {
      const r = req({ ...b, product: "product" in b ? b.product : PRODUCT });
      expect(r.product, JSON.stringify(b)).toBeUndefined();
      expect(r.brand.facts).toBe(BRAND.facts);
    }
    const quiet = req({ as: "image", layout: "street-poster", topic: "x", brand: { ...BIZ, mention: false }, product: PRODUCT });
    expect(buildMakePrompt(quiet).system).not.toContain("The ad is about Activity Tracker");
    expect(quiet.brand.facts).toContain("The product this ad is about: Activity Tracker");
    const long = req({ as: "image", layout: "street-poster", topic: "x", product: { name: "n".repeat(90), what: "w".repeat(500), forWho: "f".repeat(200) } }).product!;
    // what: 400, room for a brand's saved facts when it has no product (photoAd brandAdFacts)
    expect([long.name.length, long.what.length, long.forWho.length]).toEqual([60, 400, 120]);
  });
});

// Tok Tok Kueh's us-vs-them photo, 13 Nov: "That remix came back in a shape that can't be used" twice. Each format's own
// example is an answer in its layout's shape; written as the product rule then asked (the brand's mention as the product
// and one thing it does), the brand-carrying field runs past its word limit on most layouts, and validateMake turns the
// whole answer away.
describe("a products-bearing brand's static words", () => {
  const KUEH = { name: "Tok Tok Kueh", speaker: "business" };
  const PRODUCT = { name: "Ang Ku Kueh", what: "Soft glutinous rice skin with sweet mung bean, steamed fresh every morning.", forWho: "Office teams" };
  const WORDS_CAP = { refuse: false, reason: "", caption: "Fresh kueh for the office. Order by noon.", cta: "Save this for Friday.", hashtags: [] };
  const exampleWords = (layout: (typeof STATIC_LAYOUTS)[number]) => {
    const ex = STATIC_FORMATS.find((f) => f.slug === layout)!.example!;
    return Object.fromEntries(Object.keys(STATIC_FIELDS[layout]).map((k) => [k, ex[k] ?? ""]));
  };
  const named = (words: Record<string, string>) =>
    Object.fromEntries(Object.entries(words).map(([k, v]) => [k, v.replace(/Hilltop( Coffee| cold brew)?('s)?/, "Tok Tok Kueh's Ang Ku Kueh, steamed fresh daily,")]));
  const check = (layout: (typeof STATIC_LAYOUTS)[number], words: Record<string, string>) =>
    validateMake("image", { ...WORDS_CAP, words }, { layout, brand: req({ as: "image", layout, topic: "x", brand: KUEH, product: PRODUCT }).brand });

  it("reproduces: the product named in the brand's line overruns a field on 12 of the 22 layouts, us-vs-them's 4-word label worst", () => {
    const failed: string[] = [];
    for (const layout of STATIC_LAYOUTS) {
      const fits = exampleWords(layout);
      expect(check(layout, fits), layout).not.toBeNull();
      expect(shapeFix({ as: "image", layout }, JSON.stringify({ words: fits })), layout).toBeNull();
      const words = named(fits);
      const over = Object.entries(words).filter(([k, v]) => v.split(/\s+/).filter(Boolean).length > STATIC_FIELDS[layout][k]);
      expect(check(layout, words) === null, layout).toBe(over.length > 0);
      if (!over.length) continue;
      failed.push(layout);
      // the second try names every field that ran over, with its count and its limit
      const fix = shapeFix({ as: "image", layout }, JSON.stringify({ ...WORDS_CAP, words }))!;
      for (const [k, v] of over) expect(fix, `${layout} ${k}`).toContain(`words.${k} has ${v.split(/\s+/).filter(Boolean).length} words, over its ${STATIC_FIELDS[layout][k]}`);
    }
    expect(failed).toContain("us-vs-them");
    expect(failed).toHaveLength(12);
    expect(shapeFix({ as: "image", layout: "us-vs-them" }, JSON.stringify({ words: named(exampleWords("us-vs-them")) }))).toMatch(/^words\.us has 9 words, over its 4\. Return the whole JSON object again/);
  });

  it("tells the writer on every layout to keep each field in its limit and use the product's shortest name", () => {
    for (const layout of STATIC_LAYOUTS) {
      const { system } = buildMakePrompt(req({ as: "image", layout, topic: "x", brand: KUEH, product: PRODUCT }));
      expect(system, layout).toContain("Every field keeps its word limit: use the product's shortest name");
      expect(system, layout).not.toContain("Where the words say what the brand does, they name");
    }
  });

  it("names an empty field too, and leaves a fitting answer, junk and every other format to the plain retry", () => {
    const words = { ...exampleWords("us-vs-them"), us: "" };
    expect(shapeFix({ as: "image", layout: "us-vs-them" }, JSON.stringify({ words }))).toMatch(/^words\.us is empty\./);
    expect(shapeFix({ as: "image", layout: "headline" }, JSON.stringify({ words: { headline: "w ".repeat(30) } }))).toBeNull();
    expect(shapeFix({ as: "meme", layout: "pov" }, "{}")).toBeNull();
    expect(shapeFix({ as: "image", layout: "street-poster" }, "not json")).toBe("words.headline is empty; words.line is empty. Return the whole JSON object again with every words field filled and within its word limit: shorten a name to its key words before going over.");
  });
});

describe("a static ad's angle", () => {
  it("is one of the twelve its examples are labelled with, each with what it does", () => {
    expect(Object.keys(STATIC_ANGLES).sort()).toEqual([...new Set(Object.values(STATIC_SHOTS).flat().map(([, angle]) => angle))].sort());
    expect(Object.keys(STATIC_ANGLES)).toHaveLength(12);
  });

  it("takes only known angles, once each, on a static layout, and the sample's opening only there", () => {
    const r = req({ as: "image", layout: "street-poster", topic: "x", angles: ["The offer", "constructor", "The offer", 7, "Bust a myth"], avoid: "Still dark, still" });
    expect(r.angles).toEqual(["The offer", "Bust a myth"]);
    expect(r.avoid).toBe("Still dark, still");
    expect(r.angle).toBeUndefined();
    const plain = req({ as: "image", layout: "headline", topic: "x", angles: ["The offer"], avoid: "Still dark" });
    expect([plain.angles, plain.avoid]).toEqual([undefined, undefined]);
    expect(req({ as: "image", layout: "street-poster", topic: "x", angles: ["nope"] }).angles).toBeUndefined();
    // the request can't set the angle itself
    expect(req({ as: "image", layout: "street-poster", topic: "x", angle: "The offer" }).angle).toBeUndefined();
  });

  it("tells the writer the angle, over the layout's own, and never to open on the sample's words", () => {
    const r = { ...req({ as: "image", layout: "street-poster", topic: "x", angles: ["Answer the doubt"], avoid: 'Still "dark", still', brand: BIZ }), angle: "Answer the doubt" };
    const { system } = buildMakePrompt(r);
    expect(system).toContain("- The ad's angle is Answer the doubt: raise a doubt a buyer has before buying and answer it with one fact. The headline and every line take this angle, over any angle a line above suggests.");
    expect(system).toContain(`- Never open with "Still 'dark', still" or those same opening words: start your own way.`);
    // offered angles alone, before the server picks, change nothing
    expect(buildMakePrompt(req({ as: "image", layout: "street-poster", topic: "x", angles: ["The offer"], brand: BIZ })).system).toBe(buildMakePrompt(req({ as: "image", layout: "street-poster", topic: "x", brand: BIZ })).system);
  });

  it("asks Jev what the brand sells, and takes software, a product or a service only at 0.5 or more", () => {
    expect(Object.keys((subjectQuestion().subject as { criteria: object }).criteria)).toEqual(["software", "product", "service"]);
    const at = (choice: string, p: number) => ({ subject: { type: "choice" as const, choice, probabilities: { [choice]: p } } });
    expect(pickSubject(at("software", 0.9))).toBe("software");
    expect(pickSubject(at("service", 0.5))).toBe("service");
    expect(pickSubject(at("product", 0.49))).toBeNull();
    expect(pickSubject(at("a shop", 0.9))).toBeNull();
    expect(pickSubject(null)).toBeNull();
    // the request can't set it
    expect(req({ as: "image", layout: "street-poster", topic: "x", subject: "software" }).subject).toBeUndefined();
  });

  it("tells the writer the brand's last openings with the sample's, once each, on a static layout only, and nothing else changes without them", () => {
    const r = { ...req({ as: "image", layout: "street-poster", topic: "x", avoid: "Still dark, still", openings: ["Heading home with follow-ups", "heading home with follow-ups", "Your memory keeps no", 7, "a".repeat(80)], brand: BIZ }), angle: "Name the pain" };
    expect(r.openings).toEqual(["Heading home with follow-ups", "Your memory keeps no", "a".repeat(40)]);
    expect(buildMakePrompt(r).system).toContain(`- Never open with "Still dark, still", "Heading home with follow-ups", "Your memory keeps no", "${"a".repeat(40)}" or those same opening words: start your own way.`);
    // the sample's alone reads as it did before
    expect(buildMakePrompt({ ...r, openings: undefined }).system).toContain('- Never open with "Still dark, still" or those same opening words: start your own way.');
    expect(req({ as: "image", layout: "headline", topic: "x", openings: ["Heading home with"] }).openings).toBeUndefined();
    expect(req({ as: "image", layout: "street-poster", topic: "x", openings: Array(9).fill(0).map((_, i) => `opening ${"abcdefghi"[i]}`) }).openings).toHaveLength(5);
  });

  it("prescribes no moment, setting or hook of its own on any layout: the angle and the picture prompt set those", () => {
    for (const layout of STATIC_LAYOUTS) {
      for (const brand of [BRAND, BIZ]) {
        const { system } = buildMakePrompt(req({ as: "image", layout, topic: "x", brand }));
        expect(system, layout).not.toMatch(/moment the buyer|walks past|at night|lit street|Mornings at work|confession about a familiar struggle/);
      }
    }
    const poster = buildMakePrompt(req({ as: "image", layout: "street-poster", topic: "x", brand: BIZ })).system;
    expect(poster).toContain("Write the words for one static ad picture. It is a poster: a big headline, the product and a small line.\n- words.headline: the poster's headline, at most 12 words.\n");
  });

  it("asks Jev to pick from the offered angles only, and falls back to the first", () => {
    const q = angleQuestion(["The offer", "Bust a myth"]);
    expect(q.angle).toMatchObject({ type: "choice", criteria: { "The offer": STATIC_ANGLES["The offer"], "Bust a myth": STATIC_ANGLES["Bust a myth"] } });
    expect(Object.keys((q.angle as { criteria: object }).criteria)).toEqual(["The offer", "Bust a myth"]);
    const choice = (c: string) => ({ angle: { type: "choice" as const, choice: c } });
    expect(pickAngle(choice("Bust a myth"), ["The offer", "Bust a myth"])).toBe("Bust a myth");
    expect(pickAngle(choice("The moment"), ["The offer", "Bust a myth"])).toBe("The offer");
    expect(pickAngle(null, ["The offer", "Bust a myth"])).toBe("The offer");
    const state = angleState(req({ as: "image", layout: "street-poster", topic: "Prospecting", brand: BIZ }));
    expect(state).toEqual({ brand: expect.stringContaining("Name: Hilltop Coffee"), ad: "A static ad that is a poster: a big headline, the product and a small line.", topic: "Prospecting" });
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
    const AS_A_USER = ["as what they use for it", "the other recommends the brand", "the assistant's reply recommends the brand", "a reply from another member that recommends the brand", "saying why they use the brand", "shared to the buyer's phone by a friend", "in a desktop notes window, in the first person, plain and personal"];
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
