import { describe, expect, it } from "vitest";
import { cleanAiTells, scanAiTells, withDisclosure, withSignOff } from "@/lib/plainText";

describe("withSignOff", () => {
  const sign = "DM me PLAN for a free review.\nThis is not financial advice.\n#cpf #singapore";

  it("adds the sign-off after a blank line", () => {
    expect(withSignOff("Hook\n\nBody.", sign)).toBe(`Hook\n\nBody.\n\n${sign}`);
  });

  it("leaves the post alone with no sign-off and never adds it twice", () => {
    expect(withSignOff("Body.  ", "")).toBe("Body.  ");
    expect(withSignOff("Body.", undefined)).toBe("Body.");
    const once = withSignOff("Body.", sign);
    expect(withSignOff(once, sign)).toBe(once);
  });

  it("skips hashtags the post already has, whatever the case", () => {
    expect(withSignOff("Body.\n\n#CPF #retirement", sign)).toBe(
      "Body.\n\n#CPF #retirement\n\nDM me PLAN for a free review.\nThis is not financial advice.\n#singapore",
    );
    // a hashtag-only line that is all repeats goes entirely
    expect(withSignOff("Body #cpf #singapore", sign)).toBe("Body #cpf #singapore\n\nDM me PLAN for a free review.\nThis is not financial advice.");
    expect(withSignOff("Body #cpf", "#cpf")).toBe("Body #cpf");
  });
});

describe("withDisclosure", () => {
  it("adds one short line for the chosen disclosures, in a fixed order, once", () => {
    expect(withDisclosure("Body.", [])).toBe("Body.");
    expect(withDisclosure("Body.\n", ["sponsored", "ai"])).toBe("Body.\n\nWritten with AI assistance. Sponsored.");
    const once = withDisclosure("Body.", ["paid"]);
    expect(once).toBe("Body.\n\nPaid partnership.");
    expect(withDisclosure(once, ["paid"])).toBe(once);
  });

  it("goes after the sign-off", () => {
    expect(withDisclosure(withSignOff("Body.", "Leo #cpf"), ["ai"])).toBe("Body.\n\nLeo #cpf\n\nWritten with AI assistance.");
  });
});

describe("tagLinks", () => {
  it("adds source, medium and campaign to each link, keeping its own query and punctuation", async () => {
    const { tagLinks } = await import("@/lib/plainText");
    const out = tagLinks("Book here: https://cal.com/jane?ref=ig. Or https://jane.sg/guide, thanks", { source: "Instagram", campaign: "3 CPF moves!" });
    expect(out).toBe(
      "Book here: https://cal.com/jane?ref=ig&utm_source=instagram&utm_medium=social&utm_campaign=3-cpf-moves. " +
        "Or https://jane.sg/guide?utm_source=instagram&utm_medium=social&utm_campaign=3-cpf-moves, thanks",
    );
  });

  it("leaves utm values already there and text without links alone", async () => {
    const { tagLinks } = await import("@/lib/plainText");
    expect(tagLinks("https://x.sg/?utm_source=newsletter", { source: "linkedin", campaign: "a" })).toBe(
      "https://x.sg/?utm_source=newsletter&utm_medium=social&utm_campaign=a",
    );
    expect(tagLinks("No links here.", { source: "linkedin", campaign: "a" })).toBe("No links here.");
    expect(tagLinks("https://x.sg", { source: "linkedin", campaign: "Most people still think being a financial adviser" })).toMatch(/utm_campaign=most-people-still-think-being$/);
  });
});

describe("cleanAiTells", () => {
  it("takes out hidden characters and turns odd spaces into plain ones", () => {
    const out = cleanAiTells("Save\u200B first,\u00A0spend\u00AD later.\uFEFF Tag\u{E0041}\u{E0042} here\u200D.");
    expect(out.text).toBe("Save first, spend later. Tag here.");
    expect(out.changes).toBe(7);
  });

  it("keeps the joiner inside emoji, so families, skin tones and flags stay whole", () => {
    const emoji = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467} \u{1F469}\u{1F3FD}\u200D\u{1F4BB} \u{1F3F3}\uFE0F\u200D\u{1F308} \u{1F3C3}\u200D\u2640\uFE0F \u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}";
    expect(cleanAiTells(emoji)).toEqual({ text: emoji, changes: 0 });
  });

  it("turns curly quotes, dashes and the ellipsis character into plain ones", () => {
    const out = cleanAiTells("\u201CIt\u2019s fine\u201D \u2014 she said\u2026 ages 25\u201330");
    expect(out.text).toBe("\"It's fine\", she said... ages 25-30");
    expect(out.changes).toBe(6);
  });

  it("swaps stock AI words for plain ones and keeps the capital letter", () => {
    const out = cleanAiTells("Delve into a robust plan. Moreover, it's SEAMLESS and a myriad of options.");
    expect(out.text).toBe("Look at a solid plan. Also, it's SMOOTH and many options.");
    expect(out.changes).toBe(5);
  });

  it("swaps leverage only as a verb, and leaves finance terms alone", () => {
    expect(cleanAiTells("Leverage your network.").text).toBe("Use your network.");
    const finance = "Too much leverage on a second property. Comprehensive motor cover. Holistic planning.";
    expect(cleanAiTells(finance)).toEqual({ text: finance, changes: 0 });
  });

  it("never touches links, hashtags or handles", () => {
    const text = "See https://jane.sg/unlock-robust-plans and www.x.sg/delve #Innovative @SeamlessCo";
    expect(cleanAiTells(text)).toEqual({ text, changes: 0 });
  });

  it("finds nothing the second time", () => {
    const once = cleanAiTells("We leverage the robust \u201Cecosystem\u201D \u2014 additionally, utilise it.");
    expect(once.text).toBe("We use the solid \"system\", also, use it.");
    expect(cleanAiTells(once.text)).toEqual({ text: once.text, changes: 0 });
  });
});

describe("scanAiTells", () => {
  it("says what the clean found by kind: typography, and the stock words in order of the list", () => {
    const out = scanAiTells("We leverage the robust \u201Cecosystem\u201D \u2014 a testament to it.\u200B");
    expect(out.typography).toBe(4);
    expect(out.words).toEqual(["a testament to", "leverage", "robust", "ecosystem"]);
    expect(out.changes).toBe(8);
    expect(cleanAiTells("We leverage the robust \u201Cecosystem\u201D \u2014 a testament to it.\u200B")).toEqual({ text: out.text, changes: 8 });
  });
});
