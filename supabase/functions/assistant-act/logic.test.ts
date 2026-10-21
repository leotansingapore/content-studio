import { describe, expect, it } from "vitest";
import { ACT_MIN, DAYS_AHEAD, MAX_MESSAGE, TIMES, actAsk, actBody, actPick, dayKeys, timeWords, type ActBody } from "./logic";
import type { JevAnswer } from "../_shared/jev";

const posts = [
  { title: "Three CPF myths", status: "scheduled", when: "2026-10-14T09:00", platform: "linkedin" },
  { title: "Why I stopped selling ILPs", status: "draft", when: "", platform: "instagram" },
  { title: "My first client", status: "posted", when: "2026-10-02", platform: "facebook" },
];
const body = actBody({ message: "move my CPF myths post to Thursday 8pm", today: "2026-10-11", posts })!;
const choice = (choice: string, p = 0.9): JevAnswer => ({ type: "choice", choice, probabilities: { [choice]: p } });

describe("actBody (assistant-act's input)", () => {
  it("takes a message, today and the posts, cleaned", () => {
    expect(body).toEqual({ message: "move my CPF myths post to Thursday 8pm", today: "2026-10-11", posts });
    const b = actBody({ message: ` hi\u0007there ${"x".repeat(4000)}`, today: "2026-10-11", posts: [{ title: "A", status: "odd", when: "14 Oct", platform: 3 }] })!;
    expect(b.message.startsWith("hi there")).toBe(true);
    expect(b.message.length).toBe(MAX_MESSAGE);
    expect(b.posts).toEqual([{ title: "A", status: "draft", when: "", platform: "" }]);
    expect(actBody({ message: "hi", today: "2026-10-11" })!.posts).toEqual([]);
  });
  it("refuses anything else", () => {
    for (const b of [
      null,
      { message: 3, today: "2026-10-11" },
      { message: "  ", today: "2026-10-11" },
      { message: "hi", today: "2026-02-30" },
      { message: "hi", today: "11/10/2026" },
      { message: "hi", today: "2026-10-11", posts: "p1" },
      { message: "hi", today: "2026-10-11", posts: [{ title: " " }] },
      { message: "hi", today: "2026-10-11", posts: Array.from({ length: 51 }, () => posts[0]) },
    ]) expect(actBody(b), JSON.stringify(b)).toBeNull();
  });
});

describe("the days and times on offer", () => {
  it("runs from today across month ends", () => {
    const keys = dayKeys("2026-10-11");
    expect(keys.length).toBe(DAYS_AHEAD);
    expect(keys.slice(0, 2)).toEqual(["2026-10-11", "2026-10-12"]);
    expect(keys).toContain("2026-11-01");
    expect(keys[DAYS_AHEAD - 1]).toBe("2026-12-09");
  });
  it("names times the way the app does", () => {
    expect(TIMES.length).toBe(48);
    expect([timeWords("00:00"), timeWords("09:00"), timeWords("12:30"), timeWords("19:30")]).toEqual(["12am", "9am", "12:30pm", "7:30pm"]);
  });
});

describe("actAsk", () => {
  it("asks only for the action when there are no posts", () => {
    const ask = actAsk(actBody({ message: "how did my week go", today: "2026-10-11" })!);
    expect(Object.keys(ask.questions)).toEqual(["act"]);
    expect(ask.state).toEqual({ today: "Sunday 11 October 2026", message: "how did my week go" });
  });
  it("names each post, the days from today and the times", () => {
    const q = actAsk(body).questions as Record<string, { criteria: Record<string, string> }>;
    expect(Object.keys(q)).toEqual(["act", "post", "day", "time"]);
    expect(q.post.criteria).toMatchObject({
      p1: '"Three CPF myths" (scheduled for Wed 14 Oct 2026, 9am, linkedin)',
      p2: '"Why I stopped selling ILPs" (a draft, instagram)',
      p3: '"My first client" (posted on Fri 2 Oct 2026, facebook)',
    });
    expect(q.day.criteria["2026-10-11"]).toBe("Sunday 11 October 2026 (today)");
    expect(q.day.criteria["2026-10-15"]).toBe("Thursday 15 October 2026 (in 4 days)");
    expect(q.time.criteria["20:00"]).toBe("8pm");
    for (const k of ["act", "post", "day", "time"]) expect(q[k].criteria.none).toBeTruthy();
  });
});

// Today's questions, pinned before the remember act joined (phase 4 memory-core): every account not on
// NORTH_STAR_USERS must keep getting exactly these. Never update these files with vitest -u.
describe("actAsk, pinned for everyone", () => {
  it("asks today's questions with no posts and with posts", async () => {
    const none = actAsk(actBody({ message: "how did my week go", today: "2026-10-11" })!);
    await expect(JSON.stringify(none, null, 2)).toMatchFileSnapshot("./fixtures/act-ask-no-posts.json");
    await expect(JSON.stringify(actAsk(body), null, 2)).toMatchFileSnapshot("./fixtures/act-ask-posts.json");
  });
});

describe("actPick", () => {
  const move = { act: choice("move"), post: choice("p1"), day: choice("2026-10-15"), time: choice("20:00") };
  it("reads the post, day and time for a move", () => {
    expect(actPick(move, body)).toEqual({ act: "move", post: 0, day: "2026-10-15", time: "20:00" });
    expect(actPick({ ...move, time: choice("none") }, body)).toEqual({ act: "move", post: 0, day: "2026-10-15", time: null });
  });
  it("keeps only what the action uses", () => {
    expect(actPick({ ...move, act: choice("write") }, body)).toEqual({ act: "write", post: 0, day: null, time: null });
    expect(actPick({ ...move, act: choice("week") }, body)).toEqual({ act: "week", post: null, day: null, time: null });
    expect(actPick({ ...move, act: choice("engage_dms") }, body)).toEqual({ act: "engage_dms", post: null, day: null, time: null });
  });
  it("takes nothing it is not sure of, and nothing not offered", () => {
    expect(actPick(null, body)).toBeNull();
    expect(actPick({ ...move, act: choice("none") }, body)).toBeNull();
    expect(actPick({ ...move, act: choice("move", ACT_MIN - 0.01) }, body)).toBeNull();
    expect(actPick({ ...move, act: { type: "choice", choice: "move" } }, body)).toBeNull();
    expect(actPick({ ...move, act: choice("delete") }, body)).toBeNull();
    expect(actPick({ ...move, post: choice("p1", 0.4), day: choice("2026-10-10"), time: choice("20:15") }, body)).toEqual({
      act: "move",
      post: null,
      day: null,
      time: null,
    });
    expect(actPick({ ...move, post: choice("p4") }, body)!.post).toBeNull();
  });
});

// keeps the type import honest
export const _b: ActBody = body;
