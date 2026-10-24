import { describe, expect, it } from "vitest";
import { headingLabel } from "./ContextRail";

describe("headingLabel", () => {
  it("lists an all-caps eyebrow in sentence case and leaves other headings as written", () => {
    expect(headingLabel("ASK THE AGENT FOR")).toBe("Ask the agent for");
    expect(headingLabel("  AGENT\n NOW ")).toBe("Agent now");
    expect(headingLabel("2 team posts wait for you")).toBe("2 team posts wait for you");
    expect(headingLabel("Idea Dump")).toBe("Idea Dump");
    expect(headingLabel("F.A.D.S.")).toBe("F.A.D.S.");
    expect(headingLabel("CRM")).toBe("CRM");
    expect(headingLabel("2026")).toBe("2026");
  });
});
