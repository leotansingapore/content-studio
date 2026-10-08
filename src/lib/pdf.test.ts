import { describe, expect, it } from "vitest";
import { buildPdf } from "@/lib/pdf";

const dec = new TextDecoder("latin1");
const fakeJpeg = (n: number) => new Uint8Array([0xff, 0xd8, ...Array.from({ length: n }, (_, i) => i % 251), 0xff, 0xd9]);

describe("buildPdf", () => {
  const pdf = buildPdf([
    { jpeg: fakeJpeg(40), width: 1080, height: 1350 },
    { jpeg: fakeJpeg(70), width: 1080, height: 1350 },
  ]);
  const text = dec.decode(pdf);

  it("has a page per image at the image's size", () => {
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text).toContain("/Type /Pages /Kids [3 0 R 6 0 R] /Count 2");
    expect(text.match(/\/MediaBox \[0 0 1080 1350\]/g)).toHaveLength(2);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("points every xref entry and startxref at the right byte", () => {
    const start = Number(text.match(/startxref\n(\d+)\n%%EOF/)![1]);
    expect(text.slice(start, start + 4)).toBe("xref");
    const entries = text.slice(start).split("\n").slice(3, 3 + 8);
    entries.forEach((line, i) => {
      expect(line).toHaveLength(19); // 20 bytes with the newline
      const at = Number(line.slice(0, 10));
      expect(text.slice(at, at + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
  });

  it("gives each image stream its exact length, bytes intact", () => {
    const m = [...text.matchAll(/\/Length (\d+) >>\nstream\n/g)];
    const first = m[0];
    const len = Number(first[1]);
    const from = first.index! + first[0].length;
    expect(len).toBe(44);
    expect(Array.from(pdf.slice(from, from + 2))).toEqual([0xff, 0xd8]);
    expect(Array.from(pdf.slice(from + len - 2, from + len))).toEqual([0xff, 0xd9]);
    expect(text.slice(from + len, from + len + 10)).toBe("\nendstream");
  });
});
