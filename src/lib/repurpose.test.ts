import { describe, expect, it } from "vitest";
import { HOOK_FORMULAS } from "./hookFormulas";
import { longFailure, longPieceFormulas, longPostEntry, longSuccess } from "./repurpose";

describe("longPieceFormulas", () => {
  it("takes 5 different formulas in order from the start, wrapping at the end", () => {
    const f = longPieceFormulas(HOOK_FORMULAS.length - 2);
    expect(f.map((x) => x.id)).toEqual([
      HOOK_FORMULAS[HOOK_FORMULAS.length - 2].id,
      HOOK_FORMULAS[HOOK_FORMULAS.length - 1].id,
      HOOK_FORMULAS[0].id,
      HOOK_FORMULAS[1].id,
      HOOK_FORMULAS[2].id,
    ]);
    expect(Object.keys(f[0]).sort()).toEqual(["id", "name", "template"]);
  });
});

describe("longSuccess", () => {
  it("keeps posts whose formula the app sent, and the counts and usage", () => {
    const sent = longPieceFormulas(0);
    const out = longSuccess({
      extracts: { claims: ["a", "b"], numbers: ["3 of 5"], stories: [], lines: ["x"] },
      posts: [
        { formulaId: sent[1].id, post: "Post one", basedOn: "a" },
        { formulaId: "not-sent", post: "Post two", basedOn: "b" },
      ],
      truncated: true,
      usage: { used: 2, limit: 20 },
    }, sent);
    expect(out).toMatchObject({ kind: "ok", truncated: true, usage: { used: 2, limit: 20 } });
    if (out.kind !== "ok") return;
    expect(out.posts.map((p) => p.formulaId)).toEqual([sent[1].id]);
    expect(out.extracts.numbers).toEqual(["3 of 5"]);
  });

  it("is an error when no post survives", () => {
    expect(longSuccess({ extracts: {}, posts: [] }, longPieceFormulas(0)).kind).toBe("error");
  });
});

describe("longFailure", () => {
  it("names the daily limit, passes the server's message, and says when it never reached the server", () => {
    expect(longFailure(429, { error: "You've used all 20 for today." })).toEqual({ kind: "limit", message: "You've used all 20 for today." });
    expect(longFailure(422, { error: "That's short", code: "too_short" })).toEqual({ kind: "error", message: "That's short" });
    expect(longFailure(0, null)).toMatchObject({ kind: "error", message: expect.stringMatching(/connection/) });
  });
});

describe("longPostEntry", () => {
  it("is a draft in My posts with its first line as the hook and its formula kept", () => {
    const e = longPostEntry({ formulaId: "receipt", post: "\n12 reviews, 9 with no will.\n\nHere is why.", basedOn: "9 of 12 had no will" }, "facebook", "parent", new Date("2026-10-08T10:00:00Z"));
    expect(e).toMatchObject({
      hook: "12 reviews, 9 with no will.",
      draft: "12 reviews, 9 with no will.\n\nHere is why.",
      hookFormula: "receipt",
      pillarDetail: "9 of 12 had no will",
      platform: "facebook",
      audience: "parent",
      format: "text-post",
      status: "draft",
      createdAt: "2026-10-08T10:00:00.000Z",
    });
    expect(e.id).toBeTruthy();
  });
});
