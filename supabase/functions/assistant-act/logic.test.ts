import { describe, expect, it } from "vitest";
import { ACT_MIN, DAYS_AHEAD, MAX_MESSAGE, PICK_MIN, TIMES, actAsk, actBody, actPick, dayKeys, timeWords, type ActBody } from "./logic";
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

describe("the remember act (Leo only)", () => {
  const msg = actBody({ message: "from now on never use emoji in my posts", today: "2026-10-11", posts })!;
  type Q = Record<string, { instructions: string; criteria: Record<string, string> }>;
  it("is offered, with the scope question, only when leo is true", () => {
    const off = actAsk(msg).questions as Q;
    expect(off.act.criteria.remember).toBeUndefined();
    expect(off.scope).toBeUndefined();
    expect(actAsk(msg, false)).toEqual(actAsk(msg));
    const on = actAsk(msg, true).questions as Q;
    expect(Object.keys(on)).toEqual(["act", "post", "day", "time", "scope"]);
    expect(on.act.criteria.remember).toMatch(/^Tell the app a lasting preference/);
    expect(Object.keys(on.act.criteria).slice(-2)).toEqual(["remember", "none"]);
    expect(on.scope.instructions).toBe("Which kind of content does the preference in `message` apply to?");
    expect(Object.keys(on.scope.criteria)).toEqual(["posts", "videos", "pictures", "all"]);
    // everything else Leo is asked is everyone's question
    const { scope: _s, ...rest } = on;
    expect({ ...rest, act: { ...rest.act, criteria: Object.fromEntries(Object.entries(rest.act.criteria).filter(([k]) => k !== "remember")) } }).toEqual(off);
    expect(Object.keys(actAsk(actBody({ message: "remember this", today: "2026-10-11" })!, true).questions)).toEqual(["act", "scope"]);
  });
  it("reads the scope at PICK_MIN, else everything", () => {
    expect(actPick({ act: choice("remember"), scope: choice("posts") }, msg, true)).toEqual({ act: "remember", post: null, day: null, time: null, scope: "posts" });
    expect(actPick({ act: choice("remember"), scope: choice("videos", PICK_MIN - 0.01) }, msg, true)!.scope).toBe("all");
    expect(actPick({ act: choice("remember"), scope: choice("music") }, msg, true)!.scope).toBe("all");
    expect(actPick({ act: choice("remember") }, msg, true)!.scope).toBe("all");
  });
  it("needs the act at ACT_MIN, and never reaches an account not on the list", () => {
    expect(actPick({ act: choice("remember", ACT_MIN - 0.01), scope: choice("posts") }, msg, true)).toBeNull();
    expect(actPick({ act: choice("remember"), scope: choice("posts") }, msg)).toBeNull();
    expect(actPick({ act: choice("remember"), scope: choice("posts") }, msg, false)).toBeNull();
  });
});

// keeps the type import honest
export const _b: ActBody = body;
