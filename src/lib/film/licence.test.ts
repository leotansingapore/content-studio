import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DIR = fileURLToPath(new URL(".", import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
const read = (p: string) => readFileSync(join(DIR, p), "utf8");

const HUASHU = "Copyright (c) 2026 Huashu";
const CLIP = "Copyright (c) 2026 alchaincyf (花叔 · 花生)";
const PORTED: Record<string, string[]> = {
  "motion.ts": [CLIP, HUASHU],
  "icons.ts": [CLIP],
  "synth/dsp.ts": [HUASHU],
  "synth/score.ts": [HUASHU],
  "synth/sound.ts": [HUASHU],
  "synth/samples.ts": [HUASHU],
};

describe("huashu-motion's licence in src/lib/film", () => {
  it("holds nothing of the animation library, the cartoon character or the film signature", () => {
    const files = walk(DIR).filter((f) => f !== SELF);
    expect(files.length).toBeGreaterThan(8);
    for (const f of files) expect([relative(DIR, f), /gsap|\bTOON\b|toon\.js|Made with huashu/i.test(readFileSync(f, "utf8"))]).toEqual([relative(DIR, f), false]);
  });

  it("carries the copyright line in every ported file", () => {
    for (const [file, lines] of Object.entries(PORTED)) for (const line of lines) expect([file, read(file).includes(line)]).toEqual([file, true]);
  });

  it("keeps both licence texts and the notice naming the source commits", () => {
    for (const [file, line] of [["vendor/huashu/LICENSE", HUASHU], ["vendor/huashu/LICENSE-clip", CLIP]]) {
      const text = read(file);
      expect(text.startsWith(`MIT License\n\n${line}\n`)).toBe(true);
      expect(text).toContain("THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND");
    }
    const notice = read("vendor/huashu/NOTICE.md");
    expect(notice).toContain("52467f9");
    expect(notice).toContain("57d6760");
    for (const file of Object.keys(PORTED)) expect(notice).toContain(`\`${file}\``);
  });
});
