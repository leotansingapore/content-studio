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
