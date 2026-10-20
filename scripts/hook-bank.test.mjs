import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HOOK_FORMULAS } from "../src/lib/hookFormulas.ts";
import { QUESTIONS, buildHookBank, hookLines, openingLine, run } from "./hook-bank.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BANK = path.join(ROOT, "src/data/hookBank.json");

const post = (shortCode, likes, caption, type = "Video") => ({
  shortCode,
  url: `https://www.instagram.com/p/${shortCode}/`,
  type,
  productType: type === "Video" ? "clips" : "feed",
  likes,
  comments: 0,
  views: 0,
  caption,
});
// @a's usual is 200: A300 is 1.5x, A200 is 1.0x, A100 is 0.5x (listed out of order on purpose)
const TOP = {
  a: [
    post("A200", 200, "5 things I wish I knew before my first CPF top-up!", "Sidecar"),
    post("A100", 100, "Below my usual, so not proven."),
    post("A300", 300, "I reviewed 40 client files this year. 31 had the same gap."),
  ],
};
const choice = (pick, p) => ({ type: "choice", choice: pick, probabilities: { [pick]: p } });
/** Jev faked: number-reveal for A300, list for A200, "authority" for every line. */
const fakeAsk = vi.fn(async (state) => ({
  formula: state.opening_line.startsWith("I reviewed") ? choice("number-reveal", 0.7) : choice("list", 0.4),
  psychology: choice("authority", 0.8),
}));

const dirs = [];
afterEach(() => {
  vi.restoreAllMocks();
  fakeAsk.mockClear();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-bank-"));
  dirs.push(dir);
  const input = path.join(dir, "topPosts.json");
  fs.writeFileSync(input, JSON.stringify(TOP));
  return { input, out: path.join(dir, "hookBank.json") };
}
const quiet = () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
};

describe("no TYPESAFE_API_KEY", () => {
  it("the real script exits 0 and leaves hookBank.json as it is", () => {
    const before = fs.readFileSync(BANK);
    const env = { ...process.env };
    delete env.TYPESAFE_API_KEY;
    const r = spawnSync(process.execPath, [path.join(ROOT, "scripts/hook-bank.mjs")], { env, encoding: "utf8", timeout: 30_000 });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("no TYPESAFE_API_KEY");
    expect(fs.readFileSync(BANK).equals(before)).toBe(true);
  });

  it("asks nothing and writes nothing", async () => {
    quiet();
    const { input, out } = tmp();
    expect(await run({ env: {}, ask: fakeAsk, input, out })).toBe(0);
    expect(fakeAsk).not.toHaveBeenCalled();
    expect(fs.existsSync(out)).toBe(false);
  });
});

describe("lines", () => {
  it("keeps posts at their creator's usual or better, best ratio first", () => {
    const lines = hookLines(TOP);
    expect(lines.map((l) => [l.id, l.ratio, l.format])).toEqual([
      ["A300", 1.5, "short-video"],
      ["A200", 1, "carousel"],
    ]);
    expect(lines[0]).toMatchObject({ from: "@a", url: "https://www.instagram.com/p/A300/", text: "I reviewed 40 client files this year." });
  });

  it("takes the first sentence and cuts it to 140 characters at a word", () => {
    expect(openingLine("  Spend within your means!  Then invest. ")).toBe("Spend within your means!");
    expect(openingLine("S$1.5k a month is enough. Here is why.")).toBe("S$1.5k a month is enough.");
    const long = openingLine(`${"word ".repeat(60)}end.`);
    expect(long.length).toBeLessThanOrEqual(140);
    expect(long.length).toBeGreaterThan(130);
    expect(long.endsWith("word...")).toBe(true);
    expect(openingLine("")).toBe("");
  });
});

describe("buildHookBank", () => {
  it("asks the formula question over every formula plus none, and prints the count before sending", async () => {
    expect(Object.keys(QUESTIONS.formula.criteria)).toEqual([...HOOK_FORMULAS.map((f) => f.id), "none"]);
    const order = [];
    vi.spyOn(console, "log").mockImplementation((m) => order.push(m));
    const ask = async (state, questions) => (order.push("ask"), fakeAsk(state, questions));
    await buildHookBank(TOP, ask, "2026-10-20");
    expect(order[0]).toBe("hook-bank: asking Jev about 2 lines and 21 formulas (23 calls)");
    expect(order.filter((x) => x === "ask")).toHaveLength(23);
  });

  it("files each line under a real formula id and its psychology, and every formula gets one", async () => {
    quiet();
    const bank = await buildHookBank(TOP, fakeAsk, "2026-10-20");
    expect(bank.fetched).toBe("2026-10-20");
    expect(Object.keys(bank.formulas)).toEqual(HOOK_FORMULAS.map((f) => f.id));
    expect(bank.formulas["number-reveal"]).toBe("authority");
    expect(bank.hooks).toEqual([
      { id: "A300", text: "I reviewed 40 client files this year.", formula: "number-reveal", psychology: "authority", from: "@a", ratio: 1.5, url: "https://www.instagram.com/p/A300/", format: "short-video" },
      { id: "A200", text: "5 things I wish I knew before my first CPF top-up!", formula: "list", psychology: "authority", from: "@a", ratio: 1, url: "https://www.instagram.com/p/A200/", format: "carousel" },
    ]);
  });

  it("drops a line whose formula is none, made up or under 0.4, and leaves an unsure psychology null", async () => {
    quiet();
    for (const formula of [choice("none", 0.9), choice("made-up", 0.9), choice("list", 0.39)]) {
      const bank = await buildHookBank(TOP, async () => ({ formula, psychology: choice("story", 0.9) }), "d");
      expect(bank.hooks).toEqual([]);
    }
    const unsure = await buildHookBank(TOP, async () => ({ formula: choice("list", 0.9), psychology: choice("story", 0.49) }), "d");
    expect(unsure.hooks.map((h) => h.psychology)).toEqual([null, null]);
    expect(unsure.formulas.list).toBeNull();
  });
});

describe("run", () => {
  it("writes the bank when Jev answers", async () => {
    quiet();
    const { input, out } = tmp();
    expect(await run({ env: { TYPESAFE_API_KEY: "fake" }, ask: fakeAsk, input, out, today: "2026-10-20" })).toBe(0);
    expect(JSON.parse(fs.readFileSync(out, "utf8")).hooks.map((h) => h.id)).toEqual(["A300", "A200"]);
  });

  it("writes nothing and exits 1 when Jev answers nothing", async () => {
    quiet();
    const { input, out } = tmp();
    expect(await run({ env: { TYPESAFE_API_KEY: "fake" }, ask: async () => null, input, out })).toBe(1);
    expect(fs.existsSync(out)).toBe(false);
  });

  it("writes nothing and asks nothing when no post did its creator's usual", async () => {
    quiet();
    const { input, out } = tmp();
    fs.writeFileSync(input, JSON.stringify({ a: [post("X", 10, "")] }));
    expect(await run({ env: { TYPESAFE_API_KEY: "fake" }, ask: fakeAsk, input, out })).toBe(1);
    expect(fakeAsk).not.toHaveBeenCalled();
    expect(fs.existsSync(out)).toBe(false);
  });
});
