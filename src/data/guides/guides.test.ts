import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const GUIDES = ["design", "campaigns", "claude-design"];

describe("help guides", () => {
  it("each guide has its text and no em dashes", () => {
    for (const g of GUIDES) {
      const body = readFileSync(`src/data/guides/${g}.md`, "utf8");
      expect(body.trim().length, g).toBeGreaterThan(200);
      expect(body, g).not.toContain("—");
      expect(body.startsWith("# "), `${g} keeps its title in the card, not the text`).toBe(false);
    }
  });

  it("each guide is a section on How the studio works and in the deep-link list", () => {
    const page = readFileSync("src/pages/TutorialPage.tsx", "utf8");
    const links = readFileSync("src/lib/links.ts", "utf8");
    for (const g of GUIDES) {
      expect(page, g).toContain(`id: "${g}"`);
      expect(links, g).toContain(`"${g}"`);
    }
  });
});
