import { describe, expect, it } from "vitest";
import type { FontSpec } from "./carouselLayout";
import { NOTE_H, NOTE_ITEMS, NOTE_W, layoutNote, noteSvg, type NoteLayout } from "./notesCard";

// a wide-ish system sans: each character 0.55 of the font size
const measure = (t: string, f: FontSpec) => t.length * f.size * 0.55;
const twelve = "Move savings out on payday, not at the end of every month";

const lines = (l: NoteLayout) => [...l.title, ...l.items.flatMap((i) => i.lines)];

describe("the note card", () => {
  it("fits 6 items of 12 words inside the 1080x1920 card", () => {
    const l = layoutNote({ title: "How I stopped overspending", items: Array(NOTE_ITEMS).fill(twelve) }, measure);
    expect(twelve.split(" ")).toHaveLength(12);
    expect(l.items).toHaveLength(6);
    for (const line of lines(l)) {
      expect(line.x + measure(line.text, line.font)).toBeLessThanOrEqual(NOTE_W - 96);
      expect(line.y).toBeLessThan(NOTE_H);
    }
    expect(l.bottom).toBeLessThanOrEqual(NOTE_H - 96);
    // every word is there: nothing was cut
    expect(l.items[0].lines.map((x) => x.text).join(" ")).toBe(twelve);
  });

  it("wraps a long title to at most 2 lines, cut with three dots", () => {
    const title = "How I finally stopped overspending on takeaway coffee, late night shopping and every flash sale that came along";
    const l = layoutNote({ title, items: ["Wait a day"] }, measure);
    expect(l.title).toHaveLength(2);
    expect(l.title[1].text.endsWith("...")).toBe(true);
    expect(measure(l.title[1].text, l.title[1].font)).toBeLessThanOrEqual(l.title[1].max);
  });

  it("draws the title alone when there are no items, with no rule under it", () => {
    const l = layoutNote({ title: "How I stopped overspending", items: ["", "  "] }, measure);
    expect(l.items).toHaveLength(0);
    expect(l.rule).toBeNull();
    expect(l.title.map((t) => t.text).join(" ")).toBe("How I stopped overspending");
    const svg = noteSvg(l);
    expect(svg).toContain(">overspending</text>");
    expect(svg).not.toContain("<circle");
  });

  it("keeps at most 6 items, each with its round tick box, and escapes the words", () => {
    const l = layoutNote({ title: "Tips", items: ["A & B", "<two>", "3", "4", "5", "6", "7"] }, measure);
    expect(l.items).toHaveLength(6);
    const svg = noteSvg(l);
    expect(svg.match(/<circle/g)).toHaveLength(6);
    expect(svg).toContain("A &amp; B");
    expect(svg).toContain("&lt;two&gt;");
    expect(svg).toContain(`width="${NOTE_W}" height="${NOTE_H}"`);
    expect(svg).not.toContain(">7<");
  });
});
