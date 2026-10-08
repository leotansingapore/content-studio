import { describe, expect, it } from "vitest";
import {
  anglesFrom,
  buildContextDocument,
  buildRecruitBrief,
  centreCandidate,
  emptyBrain,
  partsDone,
  personalisedScript,
  scanRecruitCompliance,
  upsertWeek,
  weekOf,
} from "./recruit";
import { SEND_TEN_SCRIPT } from "@/data/recruitKit";

describe("centreCandidate", () => {
  it("picks the best total and breaks ties on the weakest score", () => {
    const rows = [
      { name: "David", production: 5, affinity: 5, transformation: 1 },
      { name: "Jun Xion", production: 4, affinity: 4, transformation: 3 },
      { name: "", production: 5, affinity: 5, transformation: 5 },
    ];
    expect(centreCandidate(rows)?.name).toBe("Jun Xion");
    expect(centreCandidate(emptyBrain().trifecta)).toBeNull();
  });
});

describe("context document", () => {
  it("is built only from the user's own words, under the five headings", () => {
    const b = emptyBrain();
    b.icp = "I help mid-career teachers who want a career they own without starting from zero.";
    b.proof = "- Team grew from 4 to 15 in a year\n- 9x MDRT";
    b.interview = { q4: "They think it's just selling.", q10: "I left a bank job in 2019." };
    const doc = buildContextDocument(b);
    for (const h of ["1. BRAND DNA", "2. MY ONE CANDIDATE", "3. PROOF BANK", "4. STORY BANK", "5. RAW ANSWERS"]) {
      expect(doc).toContain(h);
    }
    expect(doc).toContain("- Team grew from 4 to 15 in a year");
    expect(doc).toContain("A: They think it's just selling.");
    expect(doc).not.toContain("q4");
  });
});

describe("angles", () => {
  it("turns each answered interview question into a post angle with its formula", () => {
    const b = emptyBrain();
    b.interview = { q4: "They think it's just selling.", q6: "" };
    const angles = anglesFrom(b);
    expect(angles).toHaveLength(1);
    expect(angles[0]).toMatchObject({ formula: "myth", stage: "tofu" });
  });
});

describe("recruit brief", () => {
  it("states the format rule, the stage ask and the formula", () => {
    const brief = buildRecruitBrief(emptyBrain(), { format: "li-text", formula: "myth", stage: "bofu", topic: "Career myths" });
    expect(brief).toContain("RECRUITMENT POST");
    expect(brief).toContain("TEXT POST: the first 2 lines");
    expect(brief).toContain("criteria applies");
    expect(brief).toContain("FORMULA 2, MYTH BUST");
  });
});

describe("scanRecruitCompliance", () => {
  const ids = (t: string) => scanRecruitCompliance(t).map((f) => f.ruleId);
  it("flags the kit's red lines", () => {
    expect(ids("My rookie made $8k a month in year one")).toContain("income-figure");
    expect(ids("DM me to join my team today")).toContain("hard-recruit");
    expect(ids("Achieve financial freedom with us")).toContain("income-promise");
    expect(ids("Unlike Prudential, we train you")).toContain("other-firm");
    expect(ids("Let's unlock your potential")).toContain("ai-words");
  });
  it("passes a clean soft-ask post", () => {
    expect(scanRecruitCompliance("Most people think this job is about selling. Where are you in your career right now?")).toEqual([]);
  });
});

describe("helpers", () => {
  it("personalises the Send 10 script with the ICP's who", () => {
    expect(personalisedScript(SEND_TEN_SCRIPT, "I help mid-career teachers who want more.")).toContain("for mid-career teachers,");
    expect(personalisedScript(SEND_TEN_SCRIPT, "")).toContain("[your ONE candidate]");
  });
  it("finds the Monday of a week and keeps one row per week", () => {
    expect(weekOf(new Date(2026, 9, 8))).toBe("2026-10-05"); // a Thursday
    expect(weekOf(new Date(2026, 9, 11))).toBe("2026-10-05"); // the Sunday after
    const w = upsertWeek([{ week: "2026-10-05", posts: 1, conversations: 0, inProgress: 0 }], {
      week: "2026-10-05", posts: 3, conversations: 2, inProgress: 1,
    });
    expect(w).toEqual([{ week: "2026-10-05", posts: 3, conversations: 2, inProgress: 1 }]);
  });
  it("marks the five parts done from real content", () => {
    const b = emptyBrain();
    expect(Object.values(partsDone(b)).some(Boolean)).toBe(false);
    b.conversations = b.conversations.map((c) => ({ ...c, sent: true }));
    expect(partsDone(b).conversations).toBe(true);
  });
});
