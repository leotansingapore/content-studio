import { describe, expect, it } from "vitest";
import { ACT_MIN, APPROVE_MIN, DAYS_AHEAD, MAX_MESSAGE, PICK_MIN, SKILL_MIN, SLOTS, TIMES, actAsk, actBody, actPick, agentPick, dayKeys, noP, timeWords, type ActBody } from "./logic";
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

// ---- Agent mode (phase 6, Leo only) ----

const FULL = {
  agent: true,
  chip: "video",
  source: { kind: "ad", format: "video", title: "Why teams stop logging calls" },
  pending: "A 15-second talking video about prospecting",
  open: { kind: "carousel", title: "Three CPF myths", slides: ["Myth one: CPF is locked forever", "Myth two", "Myth three"], onScreen: 2 },
  learnings: ["Never use emoji (posts)", "Use an older man as my presenter (videos)", "Keep it short (all)"],
  lastChange: "Moved Three CPF myths to Friday",
  speakers: [
    { id: "mine", look: "Your own saved face" },
    { id: "pr-k1", look: "A Malay Singaporean man in his late 30s" },
    { id: "new", look: "A Chinese Singaporean man in his 50s, short greying hair" },
  ],
  audiences: [
    { id: "a1", name: "Young parents" },
    { id: "a2", name: "Fresh graduates" },
  ],
  skills: [
    { slash: "/polish", name: "Polish", instruction: "Tighten the hook and cut filler" },
    { slash: "/linkedin", name: "LinkedIn voice", instruction: "Rewrite in my LinkedIn tone" },
  ],
  competitorAds: true,
};
const agentBody = (extra: Record<string, unknown> = {}, withPosts = true) =>
  actBody({ message: "make a 15 second video for young parents with the older presenter", today: "2026-10-11", ...(withPosts ? { posts } : {}), agent: true, ...extra }, true)!;
type AQ = Record<string, { instructions: string; criteria: Record<string, string> }>;
const asked = (b: ActBody) => actAsk(b, true).questions as AQ;
const TODAY_ACTS = ["move", "write", "week", "engage_replies", "engage_dms", "engage_thread", "engage_comment"];
const ALWAYS_ACTS = ["remix", "make", "competitor", "campaign", "capabilities", "refuse", "budget", "forget", "memory", "check"];

describe("actBody in agent mode", () => {
  it("reads the agent fields only with the gate and agent: true; anyone else's body is today's", () => {
    const raw = { message: "hi", today: "2026-10-11", posts, ...FULL };
    const today = actBody({ message: "hi", today: "2026-10-11", posts })!;
    expect(actBody(raw)).toEqual(today);
    expect(actBody(raw, false)).toEqual(today);
    expect("agent" in actBody(raw)!).toBe(false);
    expect(actBody({ ...raw, agent: "yes" }, true)).toEqual(today);
    expect(actBody(raw, true)!.agent).toEqual({ ...FULL, agent: undefined, speaker: "person", open: { ...FULL.open } });
  });
  it("starts every field empty, and cuts lists and words to their sizes", () => {
    expect(actBody({ message: "hi", today: "2026-10-11", agent: true }, true)!.agent).toEqual({
      chip: null,
      speaker: "person",
      source: null,
      pending: "",
      open: null,
      learnings: [],
      lastChange: "",
      speakers: [],
      audiences: [],
      skills: [],
      competitorAds: false,
    });
    const long = "x".repeat(400);
    const a = agentBody({
      pending: long,
      lastChange: long,
      source: { kind: "ad", title: long },
      open: { kind: "slideshow", title: long, slides: Array.from({ length: 12 }, () => long), onScreen: 11 },
      learnings: Array.from({ length: 12 }, () => long),
      speakers: Array.from({ length: 9 }, () => ({ id: "new", look: long })),
      audiences: Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, name: long })),
      skills: Array.from({ length: 14 }, () => ({ slash: long, name: long, instruction: long })),
    }).agent!;
    expect([a.pending.length, a.lastChange.length, a.source!.title.length, a.source!.format, a.open!.title.length]).toEqual([120, 120, 120, "", 120]);
    expect([a.open!.slides.length, a.open!.slides[0].length, a.open!.onScreen]).toEqual([10, 80, null]);
    expect([a.learnings.length, a.learnings[0].length, a.speakers.length, a.speakers[0].look.length, a.audiences.length, a.audiences[0].name.length]).toEqual([10, 160, 7, 160, 6, 60]);
    expect([a.skills.length, a.skills[0].slash.length, a.skills[0].name.length, a.skills[0].instruction.length]).toEqual([12, 40, 40, 300]);
    expect(agentBody({ open: { kind: "video", title: "My reel" } }).agent!.open).toEqual({ kind: "video", title: "My reel", slides: [], onScreen: null });
  });
  it("refuses a body whose agent fields have the wrong shape, so the indexes it answers with stay the app's", () => {
    for (const extra of [
      { chip: "image" },
      { speaker: "brand" },
      { competitorAds: "yes" },
      { pending: 3 },
      { lastChange: ["x"] },
      { source: { kind: "ad" } },
      { source: "a link" },
      { open: { kind: "post", title: "A" } },
      { open: { kind: "carousel", title: " " } },
      { open: { kind: "carousel", title: "A", slides: "one" } },
      { open: { kind: "carousel", title: "A", slides: ["one", 2] } },
      { learnings: "never emoji" },
      { learnings: ["ok", " "] },
      { speakers: [{ id: "u-1", look: "A face" }] },
      { speakers: [{ id: "13b28b1d-2ecb-40be-b3a9-aefc90366f9b", look: "A face" }] },
      { speakers: [{ id: "new", look: "" }] },
      { audiences: [{ id: "a1" }] },
      { skills: [{ slash: "/x", name: "X" }] },
    ])
      expect(agentBody(extra), JSON.stringify(extra)).toBeNull();
  });
});

describe("actAsk in agent mode", () => {
  it("asks each question only under its 'asked when'", () => {
    const bare = asked(agentBody({}, false));
    expect(Object.keys(bare)).toEqual(["act", "scope", "format", "length", "weeks", "pace"]);
    expect(Object.keys(bare.act.criteria)).toEqual([...TODAY_ACTS, "remember", ...ALWAYS_ACTS, "none"]);
    expect(Object.keys(asked(agentBody()))).toEqual(["act", "post", "day", "time", "scope", "format", "length", "weeks", "pace"]);
    const full = asked(agentBody(FULL));
    expect(Object.keys(full)).toEqual(["act", "post", "day", "time", "scope", "format", "length", "who", "audience", "weeks", "pace", "slide", "which", "skill"]);
    expect(Object.keys(full.act.criteria)).toEqual([...TODAY_ACTS, "remember", ...ALWAYS_ACTS, "approve", "decline", "edit", "answer", "none"]);
    const one = (extra: Record<string, unknown>) => {
      const q = asked(agentBody(extra, false));
      return [...Object.keys(q).filter((k) => !Object.keys(bare).includes(k)), ...Object.keys(q.act.criteria).filter((k) => !(k in bare.act.criteria))];
    };
    expect(one({ pending: FULL.pending })).toEqual(["approve", "decline"]);
    expect(one({ open: FULL.open })).toEqual(["slide", "edit"]);
    expect(one({ open: { kind: "video", title: "My reel" } })).toEqual(["edit"]);
    expect(one({ competitorAds: true })).toEqual(["answer"]);
    expect(one({ speakers: FULL.speakers })).toEqual(["who"]);
    expect(one({ audiences: FULL.audiences })).toEqual(["audience"]);
    expect(one({ learnings: FULL.learnings })).toEqual(["which"]);
    expect(one({ lastChange: FULL.lastChange })).toEqual(["which"]);
    expect(one({ skills: FULL.skills })).toEqual(["skill"]);
    expect(one({ chip: "post", source: FULL.source })).toEqual([]);
  });
  it("leaves today's criteria word for word and adds the rest only in agent mode", () => {
    const today = actAsk(body, true).questions as AQ;
    const full = asked(agentBody(FULL));
    for (const k of ["post", "day", "time", "scope"]) expect(full[k], k).toEqual(today[k]);
    expect(full.act.instructions).toBe(today.act.instructions);
    for (const k of [...TODAY_ACTS, "remember", "none"]) expect(full.act.criteria[k], k).toBe(today.act.criteria[k]);
    expect(actAsk(agentBody(FULL), false)).toEqual(actAsk(actBody({ message: agentBody().message, today: "2026-10-11", posts })!));
  });
  it("names the pending card, the open item, the slides, the speakers, the learnings and the skills", () => {
    const { state, questions } = actAsk(agentBody(FULL), true);
    const q = questions as AQ;
    expect(state).toEqual({
      today: "Sunday 11 October 2026",
      message: "make a 15 second video for young parents with the older presenter",
      chip: "The person pressed the Video chip",
      source: 'The person attached a post to the message: "Why teams stop logging calls" (ad, video)',
      pending: "A 15-second talking video about prospecting",
      video_preferences: "Use an older man as my presenter; Keep it short",
      last_change: "Moved Three CPF myths to Friday",
    });
    expect(q.act.criteria.edit).toBe('Change the carousel that is open on screen right now, "Three CPF myths": its words, length, tone, captions, look, or the order of its slides.');
    expect(q.slide.instructions).toBe(
      "The adviser has a carousel open with 3 slides, and slide 2 is the one on screen. Which slide does the message mean? Pick all when it means the whole carousel or names no slide.",
    );
    expect(q.slide.criteria).toEqual({ s1: 'Slide 1: "Myth one: CPF is locked forever"', s2: 'Slide 2: "Myth two"', s3: 'Slide 3: "Myth three"', all: "The whole carousel, or no slide is named." });
    expect(asked(agentBody({ open: { ...FULL.open, onScreen: undefined } })).slide.instructions).toMatch(/^The adviser has a carousel open with 3 slides\. Which slide/);
    expect(q.who.criteria).toEqual({ w1: "Your own saved face", w2: "A Malay Singaporean man in his late 30s", w3: "A Chinese Singaporean man in his 50s, short greying hair", any: "The message and their preferences say nothing about who appears." });
    expect(actAsk(agentBody({ speakers: FULL.speakers, learnings: ["Never use emoji (posts)"] }), true).state.video_preferences).toBe("None.");
    expect(q.audience.criteria).toEqual({ a1: "Young parents", a2: "Fresh graduates", none: "No audience is named, or none of these fits." });
    expect(q.which.criteria).toEqual({
      l1: "Never use emoji (posts)",
      l2: "Use an older man as my presenter (videos)",
      l3: "Keep it short (all)",
      last: "The most recent change made in this chat: `last_change`.",
      none: "None of these fits.",
    });
    expect(Object.keys(asked(agentBody({ learnings: FULL.learnings })).which.criteria)).toEqual(["l1", "l2", "l3", "none"]);
    expect(q.skill.criteria).toEqual({ s1: "Polish: Tighten the hook and cut filler", s2: "LinkedIn voice: Rewrite in my LinkedIn tone", none: "The message does not ask for any of these." });
    expect(Object.keys(q.format.criteria)).toEqual(["post", "carousel", "script", "slideshow", "wall", "speaking", "explainer", "image", "none"]);
    expect([Object.keys(q.length.criteria), Object.keys(q.weeks.criteria), Object.keys(q.pace.criteria)]).toEqual([
      ["8", "15", "20", "30", "none"],
      ["1", "2", "4", "none"],
      ["2", "3", "5", "7", "none"],
    ]);
  });
  it("gives a business brand the refuse criterion with no adviser rules", () => {
    expect(asked(agentBody()).act.criteria.refuse).toBe(
      "Ask for something that must not be made: a post that promises returns, a percentage or results, or guarantees them; names an insurer's product; copies another person's words exactly; uses another real person's face or voice; or makes a real person (a celebrity, a public figure or anyone who is not them) appear to say, recommend or endorse something.",
    );
    expect(asked(agentBody({ speaker: "business" })).act.criteria.refuse).toBe(
      "Ask for something that must not be made: a post that copies another person's words exactly, uses another real person's face or voice, or makes a real person (a celebrity, a public figure or anyone outside the business) appear to say, recommend or endorse something.",
    );
  });
  it("sends Jev this request for a full agent body (pinned: read the diff before changing it)", async () => {
    await expect(JSON.stringify(actAsk(agentBody(FULL), true), null, 2)).toMatchFileSnapshot("./fixtures/act-ask-agent.json");
  });
});

describe("agentPick", () => {
  const b = agentBody(FULL);
  it("never takes a bare acknowledgement as a yes, however sure Jev is (Leo's rule: ok is noted, not go)", () => {
    for (const message of ["ok", "OK.", "okay", "k", "noted", "got it", "thanks!", "Thank you"]) {
      expect(agentPick({ act: choice("approve", 0.99) }, { ...b, message }).pick!.act, message).toBeNull();
    }
    for (const message of ["yes", "ok go ahead", "ok make it", "do it"]) {
      expect(agentPick({ act: choice("approve", 0.99) }, { ...b, message }).pick!.act, message).toBe("approve");
    }
  });
  it("refuses making a real person appear to endorse something, and promised returns, for a person and a business", () => {
    const person = JSON.stringify(actAsk(b, true).questions.act);
    const business = JSON.stringify(actAsk({ ...b, agent: { ...b.agent!, speaker: "business" } }, true).questions.act);
    for (const words of ["appear to say, recommend or endorse", "a percentage or results"]) expect(person).toContain(words);
    expect(business).toContain("appear to say, recommend or endorse");
  });
  const sure = {
    act: choice("make"),
    format: choice("speaking"),
    length: choice("15"),
    who: choice("w3"),
    audience: choice("a1"),
    weeks: choice("4"),
    pace: choice("7"),
    slide: choice("s2"),
    which: choice("l2"),
    skill: choice("s1"),
    post: choice("p2"),
    day: choice("2026-10-15"),
    time: choice("20:00"),
    scope: choice("videos"),
  };
  it("fills every slot Jev is sure of and returns each probability", () => {
    expect(agentPick(sure, b)).toEqual({
      pick: { act: "make", format: "speaking", length: 15, who: 2, audience: 0, weeks: 4, pace: 7, slide: 1, which: 1, skill: 0, post: 1, day: "2026-10-15", time: "20:00", scope: "videos" },
      p: Object.fromEntries(SLOTS.map((k) => [k, 0.9])),
    });
    expect(agentPick({ ...sure, which: choice("last") }, b).pick!.which).toBe("last");
  });
  it("holds each cut at its number and gives null just under it, with the probability still in p", () => {
    const cuts: [keyof typeof sure, string, number][] = [
      ["act", "make", ACT_MIN],
      ["act", "approve", APPROVE_MIN],
      ["act", "decline", ACT_MIN],
      ["act", "edit", ACT_MIN],
      ["act", "budget", ACT_MIN],
      ["act", "forget", ACT_MIN],
      ["format", "carousel", PICK_MIN],
      ["length", "30", PICK_MIN],
      ["who", "w1", PICK_MIN],
      ["audience", "a2", PICK_MIN],
      ["weeks", "2", PICK_MIN],
      ["pace", "3", PICK_MIN],
      ["slide", "s3", PICK_MIN],
      ["which", "l3", PICK_MIN],
      ["skill", "s2", SKILL_MIN],
      ["post", "p1", PICK_MIN],
      ["day", "2026-10-12", PICK_MIN],
      ["time", "09:00", PICK_MIN],
      ["scope", "posts", PICK_MIN],
    ];
    for (const [id, c, cut] of cuts) {
      const at = agentPick({ ...sure, [id]: choice(c, cut) }, b);
      const under = agentPick({ ...sure, [id]: choice(c, cut - 0.01) }, b);
      expect(at.pick![id], `${id} ${c} at ${cut}`).not.toBeNull();
      expect(under.pick![id], `${id} ${c} under ${cut}`).toBeNull();
      expect(under.p[id]).toBeCloseTo(cut - 0.01);
    }
    expect([APPROVE_MIN, SKILL_MIN]).toEqual([0.8, 0.7]);
    expect(agentPick({ act: choice("approve", 0.79) }, b).pick!.act).toBeNull();
    expect(agentPick({ act: choice("approve", 0.8) }, b).pick!.act).toBe("approve");
  });
  it("reads an option that says nothing as null, and keeps scope's all", () => {
    const none = agentPick({ act: choice("none"), format: choice("none"), length: choice("none"), who: choice("any"), audience: choice("none"), slide: choice("all"), which: choice("none"), skill: choice("none"), post: choice("none"), scope: choice("all") }, b).pick!;
    expect([none.act, none.format, none.length, none.who, none.audience, none.slide, none.which, none.skill, none.post, none.scope]).toEqual([null, null, null, null, null, null, null, null, null, "all"]);
  });
  it("never takes an option this body was not offered", () => {
    const bare = agentBody({}, false);
    expect(agentPick({ act: choice("approve", 0.95) }, bare).pick!.act).toBeNull();
    expect(agentPick({ act: choice("decline") }, bare).pick!.act).toBeNull();
    expect(agentPick({ act: choice("edit") }, bare).pick!.act).toBeNull();
    expect(agentPick({ act: choice("answer") }, bare).pick!.act).toBeNull();
    expect(agentPick({ act: choice("delete") }, bare).pick!.act).toBeNull();
    const stray = agentPick({ ...sure, who: choice("w4"), audience: choice("a3"), slide: choice("s4"), which: choice("l4"), skill: choice("s3"), post: choice("p9"), length: choice("45") }, b);
    expect([stray.pick!.who, stray.pick!.audience, stray.pick!.slide, stray.pick!.which, stray.pick!.skill, stray.pick!.post, stray.pick!.length]).toEqual([null, null, null, null, null, null, null]);
    expect([stray.p.who, stray.p.audience, stray.p.slide, stray.p.post]).toEqual([null, null, null, null]);
    const notAsked = agentPick(sure, bare);
    expect([notAsked.pick!.who, notAsked.pick!.slide, notAsked.pick!.post, notAsked.p.who, notAsked.p.skill, notAsked.p.day]).toEqual([null, null, null, null, null, null]);
    expect(agentPick({ act: choice("make") }, agentBody({ speaker: "business" })).pick!.act).toBe("make");
  });
  it("keeps a sure skill when the act is unsure, and gives no pick and no probabilities when Jev never answered", () => {
    expect(agentPick({ act: choice("none", 0.7), skill: choice("s2", 0.75) }, b).pick).toMatchObject({ act: null, skill: 1 });
    expect(agentPick(null, b)).toEqual({ pick: null, p: noP() });
    expect(Object.values(noP())).toEqual(SLOTS.map(() => null));
  });
});
