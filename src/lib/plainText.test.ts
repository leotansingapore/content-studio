import { describe, expect, it } from "vitest";
import { withDisclosure, withSignOff } from "@/lib/plainText";

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
