import { describe, expect, it } from "vitest";
import type { Measure } from "./carouselLayout";
import { CARD, FRAME_W, cardSvg, layoutCard } from "./crumpleCard";
import { ICON_COLOR } from "./notifyStack";

// a sans face about 0.55 em a character, as carouselLayout's tests measure
const measure: Measure = (text, font) => [...text].length * font.size * 0.55;
const HOOK = "You have 37 leads you never followed up on";

describe("the crumpled notification's card", () => {
  it("holds a short hook on one line at the largest size, and a 45-character one on two lines", () => {
    const short = layoutCard("Stop guessing", "Leo Tan", measure);
    expect(short.lines.map((l) => l.text)).toEqual(["Stop guessing"]);
    expect(short.font.size).toBe(56);
    const long = layoutCard(HOOK, "Leo Tan", measure);
    expect(long.lines.map((l) => l.text).join(" ")).toBe(HOOK);
    expect(long.lines).toHaveLength(2);
    expect(long.font.size).toBeGreaterThanOrEqual(44);
  });

  it("never drops a word: past two lines at the smallest size, the card grows a line", () => {
    const l = layoutCard("word ".repeat(30), "", measure);
    expect(l.font.size).toBe(44);
    expect(l.lines.length).toBeGreaterThan(2);
    expect(l.lines.map((x) => x.text).join(" ")).toBe("word ".repeat(30).trim());
  });

  it("puts the label over the message, in capitals and at most 20 characters, inside the card, under Reels' top band", () => {
    const l = layoutCard(HOOK, "Leo Tan Financial Services Pte Ltd", measure);
    expect(l.label?.text).toBe("LEO TAN FINANCIAL SE");
    expect(l.y).toBe(CARD.top);
    expect(CARD.top / 1920).toBeGreaterThan(0.15);
    for (const y of [l.label!.y, ...l.lines.map((x) => x.y)]) expect(y > l.y && y < l.y + l.h).toBe(true);
    expect(l.label!.y).toBeLessThan(l.lines[0].y);
    // no label: no label line, and a shorter card
    const bare = layoutCard(HOOK, "  ", measure);
    expect(bare.label).toBeNull();
    expect(bare.h).toBeLessThan(l.h);
    expect(CARD.x + CARD.w).toBeLessThanOrEqual(FRAME_W - CARD.x);
  });

  it("draws our own plain card: the hook escaped, the brand's circle and letter, and no app chrome", () => {
    const svg = cardSvg(layoutCard("Fees < 1% & still losing?", "Leo", measure), "#0F766E", "Leo");
    expect(svg).toContain(">Fees &lt; 1% &amp; still</text>");
    expect(svg).toContain('fill="#0F766E"');
    expect(svg).toMatch(/text-anchor="middle">L<\/text>/);
    expect(svg).toContain(">NOW</text>");
    expect(svg).not.toMatch(/instagram|tiktok|whatsapp|<image/i);
    // a colour too pale to see on the card, or one that isn't a colour, never gives an invisible circle
    expect(cardSvg(layoutCard(HOOK, "", measure), "#FAFAFA", "y")).not.toContain('fill="#FAFAFA"');
    expect(cardSvg(layoutCard(HOOK, "", measure), "red;x", "y")).toContain(`fill="${ICON_COLOR}"`);
  });
});
