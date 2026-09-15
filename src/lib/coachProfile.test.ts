import { describe, expect, it } from "vitest";
import {
  COACH_FIELDS,
  coachContext,
  emptyProfile,
  profileCompleteness,
  hasAnyProfile,
} from "./coachProfile";

describe("emptyProfile", () => {
  it("has every field with empty defaults", () => {
    const p = emptyProfile();
    for (const f of COACH_FIELDS) {
      expect(typeof p[f.key]).toBe("string");
    }
    expect(p.likes).toEqual([]);
    expect(p.dislikes).toEqual([]);
  });
});

describe("profileCompleteness", () => {
  it("is 0 when empty and 100 when all text fields are filled", () => {
    expect(profileCompleteness(emptyProfile()).pct).toBe(0);
    const full = emptyProfile();
    for (const f of COACH_FIELDS) (full[f.key] as string) = "x";
    const c = profileCompleteness(full);
    expect(c.filled).toBe(c.total);
    expect(c.pct).toBe(100);
  });
});

describe("hasAnyProfile", () => {
  it("is false for empty and true once anything is set", () => {
    expect(hasAnyProfile(emptyProfile())).toBe(false);
    expect(hasAnyProfile({ ...emptyProfile(), audience: "parents" })).toBe(true);
    expect(hasAnyProfile({ ...emptyProfile(), likes: ["stories"] })).toBe(true);
  });
});

describe("coachContext", () => {
  it("is empty when nothing is filled", () => {
    expect(coachContext(emptyProfile())).toBe("");
  });

  it("includes only the filled fields and the learned prefs", () => {
    const p = {
      ...emptyProfile(),
      audience: "young SG parents",
      offLimits: "politics",
      likes: ["personal stories"],
      dislikes: ["hard selling"],
    };
    const ctx = coachContext(p);
    expect(ctx).toContain("young SG parents");
    expect(ctx).toContain("Lean into: personal stories");
    expect(ctx).toContain("Avoid: hard selling");
    expect(ctx).toContain("NEVER post about: politics");
    // A field left blank must not appear.
    expect(ctx).not.toContain("My story");
  });
});
