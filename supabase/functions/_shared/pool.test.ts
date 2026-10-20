import { describe, expect, it } from "vitest";
import { pool } from "./pool";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("pool", () => {
  it("pairs each answer with its own item however long each one takes", async () => {
    // the first items take longest, so they finish last
    const out = await pool(["a", "b", "c", "d", "e"], 3, async (t, k) => (await wait((5 - k) * 3), `${t}${k}`));
    expect(out).toEqual(["a0", "b1", "c2", "d3", "e4"]);
  });

  it("asks about every item once and never more than the limit at a time", async () => {
    let live = 0;
    let most = 0;
    const seen: number[] = [];
    await pool(Array.from({ length: 9 }, (_, i) => i), 4, async (n) => {
      most = Math.max(most, ++live);
      seen.push(n);
      await wait(2);
      live--;
    });
    expect(most).toBe(4);
    expect(seen.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("fails the whole run when one item fails", async () => {
    await expect(pool([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("provider down");
      return n;
    })).rejects.toThrow("provider down");
  });
});
