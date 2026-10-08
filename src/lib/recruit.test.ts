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
  recruitPostsInWeek,
  stageMix,
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

describe("recruitment analytics", () => {
  const drafts = [
    { pillarDetail: "Recruitment - TOFU - Myth Bust", status: "posted", postedAt: new Date(2026, 9, 6, 20).toISOString(), createdAt: "2026-10-01T00:00:00Z" },
    { pillarDetail: "Recruitment - BOFU - Best-fit formula", status: "posted", postedAt: new Date(2026, 9, 12, 9).toISOString(), createdAt: "2026-10-01T00:00:00Z" },
    { pillarDetail: "Recruitment - MOFU - The Hard Truth", status: "draft", createdAt: new Date(2026, 9, 7).toISOString() },
    { pillarDetail: "CPF top-ups", status: "posted", postedAt: new Date(2026, 9, 6).toISOString(), createdAt: "2026-10-01T00:00:00Z" },
  ];
  it("counts only posted recruitment posts inside the week", () => {
    expect(recruitPostsInWeek(drafts, "2026-10-05")).toBe(1);
    expect(recruitPostsInWeek(drafts, "2026-10-12")).toBe(1);
  });
  it("splits recruitment drafts by stage against 50/30/20", () => {
    const mix = stageMix(drafts, new Date(2026, 8, 1));
    expect(mix.map((m) => [m.id, m.count, m.share, m.target])).toEqual([
      ["tofu", 1, 33, 50],
      ["mofu", 1, 33, 30],
      ["bofu", 1, 33, 20],
    ]);
  });
});

describe("whatsappLink", () => {
  it("opens WhatsApp with the script and the first name filled in", async () => {
    const { whatsappLink } = await import("@/components/recruit/Conversations");
    const url = whatsappLink("Hi [name]! I'm working on a series.", "Jun Xion Tan");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toBe("Hi Jun! I'm working on a series.");
  });
});

describe("draft guards", () => {
  it("swaps em dashes for commas", async () => {
    const { stripDashes } = await import("./recruit");
    expect(stripDashes("Not the best salespeople — the ones who stay.")).toBe("Not the best salespeople, the ones who stay.");
  });
  it("flags numbers the user never gave, ignoring single digits", async () => {
    const { unsupportedNumbers } = await import("./recruit");
    const ctx = "I taught for 8 years. Team of 12. Joined in 2019.";
    expect(unsupportedNumbers("My team of 12 spends 80 percent of its time advising. 3 things I learned since 2019.", ctx)).toEqual(["80 percent"]);
    expect(unsupportedNumbers("Team up 44% this year", "Team up 44 percent")).toEqual([]);
  });
});
