import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compare, run, stateOf, tagTopPosts } from "./tag-top-posts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REAL = path.join(ROOT, "src/data/topPosts.json");

const choice = (pick, p) => ({ type: "choice", choice: pick, probabilities: { [pick]: p } });
const post = (shortCode, caption, extra = {}) => ({ shortCode, url: `https://www.instagram.com/p/${shortCode}/`, type: "Image", likes: 10, comments: 0, views: 0, caption, ...extra });
const TAGGED = { formula: "list", angle: "Educational", topic: "Insurance", emotion: "trust", audience: "parents", p: { formula: 0.8, angle: 0.7, topic: 0.9, emotion: 0.6, audience: 0.6 } };
// the keyword rules read A1 as CPF / Contrarian (a myth) and A2 as Investment / Educational
const TOP = () => ({
  a: [
    post("A1", "The biggest CPF myth: you can't touch it until 65. Here is what is true."),
    post("A2", "Step-by-step guide to your first ETF.", { tags: TAGGED }),
    post("A3", ""),
  ],
});
const ADVISORS = [{ handle: "@a", platform: "instagram", niche: [] }];
/** Jev faked: A1 is CPF and Contrarian. */
const fakeAsk = vi.fn(async () => ({ formula: choice("myth-bust", 0.7), angle: choice("contrarian", 0.66), topic: choice("cpf", 0.9), emotion: choice("curiosity", 0.55), audience: choice("general", 0.5) }));

const dirs = [];
afterEach(() => {
  vi.restoreAllMocks();
  fakeAsk.mockClear();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
function tmp(top = TOP()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tag-top-posts-"));
  dirs.push(dir);
  const input = path.join(dir, "topPosts.json");
  const advisors = path.join(dir, "advisors.json");
  fs.writeFileSync(input, JSON.stringify(top));
  fs.writeFileSync(advisors, JSON.stringify(ADVISORS));
  return { input, advisors };
}
const quiet = () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  return log;
};

describe("no TYPESAFE_API_KEY", () => {
  it("the real script exits 0 and leaves topPosts.json as it is", () => {
    const before = fs.readFileSync(REAL);
    const env = { ...process.env };
    delete env.TYPESAFE_API_KEY;
    const r = spawnSync(process.execPath, [path.join(ROOT, "scripts/tag-top-posts.mjs")], { env, encoding: "utf8", timeout: 30_000 });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("no TYPESAFE_API_KEY");
    expect(fs.readFileSync(REAL).equals(before)).toBe(true);
  });

  it("asks nothing and writes nothing", async () => {
    quiet();
    const { input, advisors } = tmp();
    const before = fs.readFileSync(input, "utf8");
    expect(await run({ env: {}, ask: fakeAsk, input, advisors, argv: [] })).toBe(0);
    expect(fakeAsk).not.toHaveBeenCalled();
    expect(fs.readFileSync(input, "utf8")).toBe(before);
  });
});

describe("tagging", () => {
  it("skips posts that already have tags or no caption, and asks the five questions about the rest", async () => {
    quiet();
    const top = TOP();
    expect(await tagTopPosts(top, fakeAsk)).toEqual({ asked: 1, tagged: 1 });
    expect(fakeAsk).toHaveBeenCalledTimes(1);
    const [state, questions] = fakeAsk.mock.calls[0];
    expect(state).toEqual(stateOf(top.a[0]));
    expect(state.hook).toBe("The biggest CPF myth: you can't touch it until 65.");
    expect(Object.keys(questions)).toEqual(["formula", "angle", "topic", "emotion", "audience"]);
    expect(top.a[0].tags).toEqual({
      formula: "myth-bust", angle: "Contrarian", topic: "CPF", emotion: "curiosity", audience: "general",
      p: { formula: 0.7, angle: 0.66, topic: 0.9, emotion: 0.55, audience: 0.5 },
    });
    expect(top.a[1].tags).toBe(TAGGED);
    expect(top.a[2]).not.toHaveProperty("tags");
  });

  it("writes the file once Jev answers, and leaves it when Jev answers nothing", async () => {
    quiet();
    const { input, advisors } = tmp();
    expect(await run({ env: { TYPESAFE_API_KEY: "k" }, ask: fakeAsk, input, advisors, argv: [] })).toBe(0);
    expect(JSON.parse(fs.readFileSync(input, "utf8")).a[0].tags.topic).toBe("CPF");

    const again = tmp();
    const before = fs.readFileSync(again.input, "utf8");
    expect(await run({ env: { TYPESAFE_API_KEY: "k" }, ask: async () => null, ...again, argv: [] })).toBe(0);
    expect(fs.readFileSync(again.input, "utf8")).toBe(before);
  });
});

describe("--compare", () => {
  it("counts where the keyword rules and Jev disagree", async () => {
    quiet();
    const top = TOP();
    await tagTopPosts(top, fakeAsk);
    const c = compare(top, ADVISORS);
    expect(c.rows.map((r) => r.id)).toEqual(["@a A1", "@a A2"]);
    // A1: both say CPF and Contrarian. A2: rules Investment / Educational, Jev Insurance / Educational
    expect(c.rows[0].topic).toMatchObject({ rule: "CPF", jev: "CPF", differs: false });
    expect(c.rows[1].topic).toMatchObject({ rule: "Investment", jev: "Insurance", p: 0.9, differs: true, sure: true });
    expect(c.topic).toEqual({ differs: 1, sureDiffers: 1 });
    expect(c.angle).toEqual({ differs: 0, sureDiffers: 0 });
  });

  it("prints every row and the counts, from stored tags even without a key", async () => {
    const log = quiet();
    const { input, advisors } = tmp();
    expect(await run({ env: {}, ask: fakeAsk, input, advisors, argv: ["--compare"] })).toBe(0);
    const out = log.mock.calls.map((c) => c[0]).join("\n");
    expect(out).toContain("@a A2  topic Investment | jev Insurance (0.9) *");
    expect(out).toContain("topic: 1 of 1 disagree");
    expect(fakeAsk).not.toHaveBeenCalled();
  });
});
