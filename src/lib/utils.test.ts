import { describe, expect, it } from "vitest";
import { humanLabel } from "./utils";

describe("humanLabel", () => {
  it("turns data keys into sentence-case labels", () => {
    expect(humanLabel("pre-retiree")).toBe("Pre retiree");
    expect(humanLabel("text-only")).toBe("Text only");
    expect(humanLabel("general")).toBe("General");
  });
  it("keeps acronyms upper case, plurals included", () => {
    expect(humanLabel("social-media-for-fcs")).toBe("Social media for FCs");
    expect(humanLabel("cpf-for-foreigners")).toBe("CPF for foreigners");
    expect(humanLabel("tax-srs")).toBe("Tax SRS");
    expect(humanLabel("etfs")).toBe("ETFs");
  });
});
