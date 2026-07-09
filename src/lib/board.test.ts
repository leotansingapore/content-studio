import { describe, expect, it } from "vitest";
import { columnOf } from "./board";
import type { DraftEntry } from "./draftHistory";

const draft = (over: Partial<DraftEntry>): DraftEntry => ({
  id: "d1",
  createdAt: "2026-07-09T00:00:00.000Z",
  hook: "h",
  draft: "body",
  pillar: "p",
  pillarDetail: "",
  audience: "a",
  format: "short-video",
  platform: "instagram",
  ctaType: "none",
  ...over,
});

describe("columnOf", () => {
  it("posted status always wins", () =>
    expect(columnOf(draft({ status: "posted" }), { d1: "editing" })).toBe("posted"));

  it("scheduled status wins over stage", () =>
    expect(columnOf(draft({ status: "scheduled" }), { d1: "idea" })).toBe("scheduled"));

  it("uses the stored production stage for plain drafts", () =>
    expect(columnOf(draft({}), { d1: "to-film" })).toBe("to-film"));

  it("defaults new drafts to scripted", () =>
    expect(columnOf(draft({}), {})).toBe("scripted"));
});
