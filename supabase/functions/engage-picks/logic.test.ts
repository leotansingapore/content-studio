import { describe, expect, it } from "vitest";
import { candidatesFrom, jevAsk, pickClients, readable } from "./logic";

const NOW = Date.parse("2026-10-08T00:00:00Z");
const audits = [
  {
    platform: "instagram",
    handle: "me",
    posts: [
      { url: "https://ig/p/1", postedAt: "2026-10-01T00:00:00Z", commenters: [
        { user: "ann", text: "How much should I set aside for my son's university?", at: "2026-10-02T00:00:00Z" },
        { user: "me", text: "Thanks!", at: "2026-10-03T00:00:00Z" },
        { user: "ben", text: "Nice one bro", at: "2026-10-01T05:00:00Z" },
      ] },
      { url: "https://ig/p/2", postedAt: "2026-07-01T00:00:00Z", commenters: [{ user: "old", text: "Is term life worth it?", at: "2026-07-02T00:00:00Z" }] },
      { url: "https://ig/p/3", postedAt: "2026-10-05T00:00:00Z", commenters: [{ user: "ann", text: "Saved", at: "2026-10-06T00:00:00Z" }] },
    ],
  },
];

describe("likely clients", () => {
  it("takes recent commenters once each, newest first, never the adviser", () => {
    const c = candidatesFrom(audits, NOW);
    expect(c.map((x) => [x.user, x.text, x.postUrl])).toEqual([
      ["ann", "Saved / How much should I set aside for my son's university?", "https://ig/p/3"],
      ["ben", "Nice one bro", "https://ig/p/1"],
    ]);
  });

  it("asks Jev only about comments it can read", () => {
    expect(readable("How much is this plan?")).toBe(true);
    expect(readable("请问这个计划多少钱")).toBe(false);
    expect(readable("🔥🔥")).toBe(false);
    const { state, questions } = jevAsk([
      { user: "a", text: "How much is this plan?", at: null, platform: "instagram", postUrl: "" },
      { user: "b", text: "请问这个计划多少钱", at: null, platform: "instagram", postUrl: "" },
    ]);
    expect(Object.keys(questions)).toEqual(["c0"]);
    expect(state).toEqual({ c0: "How much is this plan?" });
  });

  it("picks the likeliest two, and tops up with the newest when Jev says no or is away", () => {
    const cands = ["a", "b", "c", "d"].map((user) => ({ user, text: "x", at: null, platform: "instagram", postUrl: "" }));
    const answers = { c0: { type: "noul" as const, noul: 0.1 }, c1: { type: "noul" as const, noul: 0.8 }, c2: { type: "noul" as const, noul: 0.4 } };
    expect(pickClients(cands, answers).map((p) => [p.user, p.why])).toEqual([["b", "likely"], ["c", "likely"]]);
    expect(pickClients(cands, { c3: { type: "noul", noul: 0.9 } }).map((p) => [p.user, p.why])).toEqual([["d", "likely"], ["a", "recent"]]);
    expect(pickClients(cands, null).map((p) => [p.user, p.why])).toEqual([["a", "recent"], ["b", "recent"]]);
    expect(pickClients([], null)).toEqual([]);
  });
});
