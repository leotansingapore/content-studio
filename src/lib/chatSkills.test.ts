import { beforeEach, describe, expect, it, vi } from "vitest";

// callFn faked per function name: an answer, an Error to throw, or nothing (the test says it must not be called)
const fn = vi.hoisted(() => ({ calls: [] as { name: string; body: Record<string, unknown> }[], answers: {} as Record<string, unknown> }));
vi.mock("@/lib/edgeFn", () => {
  class EdgeError extends Error {
    constructor(message: string, public status: number, public code = "") {
      super(message);
    }
  }
  return {
    EdgeError,
    callFn: async (name: string, body: Record<string, unknown>) => {
      fn.calls.push({ name, body });
      const a = fn.answers[name === "writing-judge" ? `writing-judge:${body.mode}` : name];
      if (a === undefined) throw new Error(`unexpected call to ${name}`);
      if (a instanceof Error) throw a;
      return a;
    },
  };
});

import { ACTIVITY_PREFIX, setActivityOn } from "@/lib/activity";
import {
  BUILT_IN_SKILLS, FULL_LINE, MAX_RUNS, PICK_LINE, loadMySkills, loadSkillRuns, markSeen, matchSlash, newAds, removeMySkill, restoreMySkill, runSkill, runsKey,
  saveMySkill, skillRunText, skillsKey, slashOf, type MySkill, type SkillRun,
} from "@/lib/chatSkills";
import type { DraftEntry } from "@/lib/draftHistory";

const UID = "u1";
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
// Wed 22 Oct 2026, 10:00 in Singapore
const NOW = new Date("2026-10-22T02:00:00Z");
const store = new Map<string, string>();
let full = false;

beforeEach(() => {
  store.clear();
  full = false;
  fn.calls.length = 0;
  fn.answers = {};
  const localStorage = {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (full) throw new DOMException("full", "QuotaExceededError");
      store.set(k, v);
    },
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("window", { localStorage, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
  setActivityOn(true);
});

const draft = (id: string, o: Partial<DraftEntry> = {}): DraftEntry => ({
  id, createdAt: "2026-10-20T01:00:00Z", hook: `Hook ${id}`, draft: `Hook ${id}\n\nThe body of post ${id}.`, pillar: "", pillarDetail: "", audience: "", format: "text-post", platform: "linkedin", ctaType: "", ...o,
});
const setDrafts = (list: DraftEntry[]) => store.set(`content-studio-drafts-${UID}`, JSON.stringify(list));
const skill = (name: string, works: MySkill["works"] = "post", instruction = "Tighten this for LinkedIn: under 150 words.") => saveMySkill(UID, { name, instruction, works });
const activity = () => [...store].filter(([k]) => k.startsWith(ACTIVITY_PREFIX)).flatMap(([, v]) => JSON.parse(v));

describe("my skills", () => {
  it("makes the slash from the name: lowercase, spaces to hyphens, other characters dropped", () => {
    expect(slashOf("Tighten for LinkedIn!")).toBe("tighten-for-linkedin");
    expect(slashOf("  Hook -- check ")).toBe("hook-check");
    expect(slashOf("!!!")).toBe("");
  });

  it("saves to content-studio-chatskills- with an id that is never uuid-shaped, and an edit overwrites in place", () => {
    expect(skill("Tighten for LinkedIn")).toBeNull();
    const [s] = loadMySkills(UID);
    expect(skillsKey(UID)).toBe(`content-studio-chatskills-${UID}`);
    expect(s).toMatchObject({ name: "Tighten for LinkedIn", slash: "tighten-for-linkedin", works: "post" });
    expect(s.id).toMatch(/^s[0-9a-z]+$/);
    expect(s.id).not.toMatch(UUID_RE);
    expect(skill("Second one", "new")).toBeNull();
    expect(saveMySkill(UID, { id: s.id, name: "Tighter for LinkedIn", instruction: "Shorter.", works: "new" })).toBeNull();
    expect(loadMySkills(UID).map((x) => [x.id === s.id, x.slash, x.works])).toEqual([[true, "tighter-for-linkedin", "new"], [false, "second-one", "new"]]);
  });

  it("refuses an empty name, a slash already taken (a ready-made one too), no instruction, the 13th and a full storage", () => {
    expect(skill("  ")).toBe("Give it a name.");
    expect(skill("!!!")).toBe("Give it a name.");
    expect(saveMySkill(UID, { name: "Fine", instruction: " ", works: "post" })).toBe("Say what it should do.");
    expect(skill("Tighten for LinkedIn")).toBeNull();
    expect(skill("tighten FOR linkedin")).toBe("You already have /tighten-for-linkedin. Pick another name.");
    expect(skill("Check")).toBe("You already have /check. Pick another name.");
    for (let i = 2; i <= 12; i++) expect(skill(`Skill ${i}`)).toBeNull();
    expect(skill("Thirteen")).toBe(FULL_LINE);
    expect(FULL_LINE).toBe("You can keep 12 skills. Delete one to add another.");
    expect(loadMySkills(UID)).toHaveLength(12);
    store.clear();
    full = true;
    expect(skill("Any")).toBe("Couldn't save that. Try again.");
  });

  it("deletes by rewriting the list, and Undo puts it back unless its slash was taken since", () => {
    skill("One");
    skill("Two");
    const one = loadMySkills(UID)[0];
    expect(removeMySkill(UID, one.id)).toEqual(one);
    expect(removeMySkill(UID, one.id)).toBeNull();
    expect(loadMySkills(UID).map((s) => s.slash)).toEqual(["two"]);
    expect(restoreMySkill(UID, one)).toBeNull();
    expect(loadMySkills(UID).map((s) => s.slash)).toEqual(["two", "one"]);
    removeMySkill(UID, one.id);
    skill("one");
    expect(restoreMySkill(UID, one)).toBe("You already have /one. Pick another name.");
  });

  it("reads a slash command: a ready-made one, one of yours in any case, an unknown word, and plain text as none", () => {
    skill("Tighten for LinkedIn");
    const mine = loadMySkills(UID);
    expect(matchSlash("/check my CPF post ", mine)).toEqual({ skill: "check", rest: "my CPF post" });
    expect(matchSlash("/Tighten-For-LinkedIn", mine)).toEqual({ skill: "tighten-for-linkedin", rest: "" });
    expect(matchSlash("/nope at all", mine)).toEqual({ skill: "nope", rest: "at all" });
    expect(matchSlash("check my post", mine)).toBeNull();
    expect(matchSlash("/", mine)).toBeNull();
  });
});

describe("runSkill without a run", () => {
  it("answers an unknown skill with the list (answer only once ads are stored) and Open skills, saving nothing", async () => {
    skill("Tighten for LinkedIn");
    const r = await runSkill(UID, "nope", {}, NOW);
    expect(r).toMatchObject({ id: "", step: "unknown", lines: ["No skill called /nope. Yours are /check, /retro, /check-week, /tighten-for-linkedin."], links: [{ label: "Open skills", path: "/skills" }] });
    store.set(`content-studio-competitor-ads-${UID}`, JSON.stringify({ c1: { checkedAt: "2026-10-21T00:00:00Z", pageId: null, pageName: "Finch", ads: [AD("1", "2026-10-20")], seen: [], fresh: [] } }));
    expect((await runSkill(UID, "nope", {}, NOW)).lines[0]).toBe("No skill called /nope. Yours are /check, /retro, /check-week, /answer, /tighten-for-linkedin.");
    expect(loadSkillRuns(UID)).toEqual([]);
    expect(fn.calls).toEqual([]);
  });

  it("asks which post for check with no post (or one that is gone): the next scheduled ones, then the newest drafts, 5 at most", async () => {
    setDrafts([
      draft("d-old", { createdAt: "2026-10-01T00:00:00Z" }),
      draft("d-new", { createdAt: "2026-10-21T00:00:00Z" }),
      draft("p", { status: "posted", postedAt: "2026-10-21T00:00:00Z" }),
      draft("s-late", { status: "scheduled", scheduledFor: "2026-10-28" }),
      draft("s-soon", { status: "scheduled", scheduledFor: "2026-10-23T09:00" }),
      draft("s-past", { status: "scheduled", scheduledFor: "2026-10-01" }),
      draft("empty", { hook: "", draft: " " }),
      draft("d-mid", { createdAt: "2026-10-10T00:00:00Z" }),
      draft("d-mid2", { createdAt: "2026-10-09T00:00:00Z" }),
    ]);
    for (const postId of [undefined, "gone", "p"]) {
      const r = await runSkill(UID, "check", { postId }, NOW);
      expect(r.step).toBe("pick-post");
      expect(r.lines).toEqual([PICK_LINE]);
      expect(r.links.map((l) => l.path)).toEqual(["s-soon", "s-late", "d-new", "d-mid", "d-mid2"].map((id) => `/skills?skill=check&post=${id}`));
      expect(r.links[0].label).toBe("Hook s-soon");
    }
    expect(fn.calls).toEqual([]);
    expect(loadSkillRuns(UID)).toEqual([]);
  });

  it("answers one of yours with the Write page that runs it: a rewrite of the post, or a new post's topic", async () => {
    setDrafts([draft("d1")]);
    skill("Tighten for LinkedIn");
    skill("Myth buster", "new", "Bust one money myth in 5 lines.");
    const onPost = await runSkill(UID, "tighten-for-linkedin", { postId: "d1" }, NOW);
    expect(onPost).toMatchObject({ id: "", step: "open", title: "Hook d1", postId: "d1" });
    expect(onPost.links).toEqual([{ label: "Open in Write", path: "/generate?draft=d1&ask=Tighten+this+for+LinkedIn%3A+under+150+words." }]);
    expect((await runSkill(UID, "tighten-for-linkedin", {}, NOW)).step).toBe("pick-post");
    const fresh = await runSkill(UID, "myth-buster", {}, NOW);
    expect(fresh.links).toEqual([{ label: "Open in Write", path: "/generate?pillar=topic&detail=Bust+one+money+myth+in+5+lines." }]);
    expect(fn.calls).toEqual([]);
    expect(loadSkillRuns(UID)).toEqual([]);
  });
});

describe("Check before posting", () => {
  const POST = draft("d1", { hook: "3 CPF myths at 55", draft: "3 CPF myths at 55\n\nThis plan is guaranteed and risk-free. CPF LIFE pays from 65.\nAsk me how." });
  const ok = () => {
    fn.answers = {
      "writing-judge:facts": { lines: ["CPF LIFE pays from 65."] },
      "writing-judge:human": { aiSounding: false, voiceMatch: null, specific: true, shapes: [] },
      "post-score": { score: 6.24, down: [] },
    };
  };

  it("runs the four checks on the post and builds its lines and chips, then saves and logs the result", async () => {
    setDrafts([POST]);
    ok();
    const r = await runSkill(UID, "check", { postId: "d1" }, NOW);
    expect(r.lines).toEqual([
      'Compliance: 2 flags, "guaranteed" and "risk-free".',
      "Facts to check: 1.",
      "- CPF LIFE pays from 65.",
      expect.stringMatching(/^Sounds human: \d of \d (checks pass\.|pass\. Fix first: .+\.)$/),
      "Predicted: 6.2 of 10.",
    ]);
    expect(r.links).toEqual([
      { label: "Open in Write", path: "/generate?draft=d1" },
      { label: "Fix the flags", path: "/generate?draft=d1&ask=Rewrite+without+these+words%3A+guaranteed,+risk-free.+Keep+everything+else." },
    ]);
    expect(r).toMatchObject({ skill: "check", name: "Check before posting", title: "3 CPF myths at 55", postId: "d1", by: "you", calls: 3 });
    expect(r.id).toMatch(/^r[0-9a-z]+$/);
    expect(fn.calls.map((c) => c.name).sort()).toEqual(["post-score", "writing-judge", "writing-judge"]);
    expect(loadSkillRuns(UID)).toEqual([r]);
    expect(skillRunText(r).split("\n")[0]).toBe('Check before posting on "3 CPF myths at 55":');
    expect(activity()).toEqual([expect.objectContaining({ who: "you", kind: "run", title: 'Ran Check before posting on "3 CPF myths at 55"', link: `/skills?run=${r.id}` })]);
  });

  it("says no flags, no facts and all checks passing in the spec's words", async () => {
    setDrafts([draft("d1", { draft: "We met at a kopitiam in Tampines last week.\nShe asked one question. I had no answer. Then I did." })]);
    ok();
    fn.answers["writing-judge:facts"] = { lines: [] };
    const r = await runSkill(UID, "check", { postId: "d1" }, NOW);
    expect(r.lines.slice(0, 2)).toEqual(["Compliance: no flags.", "Facts to check: none."]);
    expect(r.links).toEqual([{ label: "Open in Write", path: "/generate?draft=d1" }]);
  });

  it("keeps the other three when one part fails, in that part's own words", async () => {
    setDrafts([POST]);
    ok();
    fn.answers["post-score"] = new Error("You've used all 40 for today. It resets at 8am Singapore time.");
    fn.answers["writing-judge:human"] = new Error("Couldn't check it right now. Try again in a minute.");
    const r = await runSkill(UID, "check", { postId: "d1" }, NOW);
    expect(r.lines).toEqual([
      'Compliance: 2 flags, "guaranteed" and "risk-free".',
      "Facts to check: 1.",
      "- CPF LIFE pays from 65.",
      "Sounds human: couldn't check this. Couldn't check it right now. Try again in a minute.",
      "Predicted: couldn't check this. You've used all 40 for today. It resets at 8am Singapore time.",
    ]);
    expect(r.failed).toBeUndefined();
    expect(loadSkillRuns(UID)).toHaveLength(1);
  });
});

describe("Weekly retro", () => {
  // one post this week with no numbers, three the week before: the numbers and cadence moves
  const posted = (id: string, day: string) => draft(id, { status: "posted", postedAt: `${day}T02:00:00Z` });
  const WEEK = [posted("w1", "2026-10-20"), posted("b1", "2026-10-12"), posted("b2", "2026-10-11"), posted("b3", "2026-10-10")];

  it("gives the report's lines and Jev's move, with Open Analytics", async () => {
    setDrafts(WEEK);
    fn.answers["week-pick"] = { pick: "cadence" };
    const r = await runSkill(UID, "retro", {}, NOW);
    expect(r.lines[0]).toBe("1 post posted, -2 on the week before.");
    expect(r.lines[r.lines.length - 1]).toBe("This week's move: Post 3 times this week, up from 1.");
    expect(r.links).toEqual([{ label: "Open Analytics", path: "/analytics" }]);
    expect(fn.calls).toEqual([{ name: "week-pick", body: expect.objectContaining({ moves: [expect.objectContaining({ id: "numbers" }), expect.objectContaining({ id: "cadence" })] }) }]);
  });

  it("leaves the move out when Jev gives none, and says so when nothing was posted in 14 days", async () => {
    setDrafts(WEEK);
    fn.answers["week-pick"] = new Error("down");
    const r = await runSkill(UID, "retro", {}, NOW);
    expect(r.lines.some((l) => l.startsWith("This week's move"))).toBe(false);
    expect(r.failed).toBeUndefined();
    setDrafts([]);
    fn.calls.length = 0;
    expect((await runSkill(UID, "retro", {}, NOW)).lines).toEqual(["No posts marked posted in the last 14 days."]);
    expect(fn.calls).toEqual([]);
  });
});

describe("Check this week's posts", () => {
  it("flags only posts scheduled in the next 7 days, each with an Open chip to its calendar entry", async () => {
    setDrafts([
      draft("a", { status: "scheduled", scheduledFor: "2026-10-22T18:00", draft: "Returns are guaranteed." }),
      draft("b", { status: "scheduled", scheduledFor: "2026-10-28", draft: "Clean words only." }),
      draft("c", { status: "scheduled", scheduledFor: "2026-10-29", draft: "This is risk-free." }),
      draft("d", { status: "scheduled", scheduledFor: "2026-10-21", draft: "Yesterday was guaranteed." }),
      draft("e", { draft: "A draft that is guaranteed." }),
    ]);
    const r = await runSkill(UID, "check-week", {}, NOW);
    expect(r.lines).toEqual(["2 posts scheduled in the next 7 days. 1 has flags:", '"Hook a": "guaranteed"']);
    expect(r.links).toEqual([{ label: 'Open "Hook a"', path: "/calendar?post=a" }]);
    expect(fn.calls).toEqual([]);
  });

  it("says when none has a flag and when nothing is scheduled", async () => {
    setDrafts([draft("b", { status: "scheduled", scheduledFor: "2026-10-23", draft: "Clean words only." })]);
    expect((await runSkill(UID, "check-week", {}, NOW)).lines).toEqual(["1 post scheduled in the next 7 days. None has a flag."]);
    setDrafts([]);
    expect((await runSkill(UID, "check-week", {}, NOW)).lines).toEqual(["Nothing is scheduled in the next 7 days."]);
  });
});

const AD = (id: string, start: string | null, o: Record<string, unknown> = {}) => ({
  id, format: "video", headline: `Headline ${id}`, body: `Body of ad ${id}.`, cta: null, link: null, image: null, video: null, start, end: null, active: true, platforms: ["facebook"], versions: 1, ...o,
});

describe("Answer a competitor's new ad", () => {
  const setAds = () => {
    store.set(`content-studio-competitors-${UID}`, JSON.stringify({ list: [{ id: "owl-ab12", name: "Owl Planners", site: null, logo: null, why: "", fbPageId: "9", handles: {}, adsCountry: "SG", source: "typed", addedAt: "2026-10-01T00:00:00Z" }], dismissed: [] }));
    store.set(`content-studio-competitor-ads-${UID}`, JSON.stringify({
      "owl-ab12": {
        checkedAt: "2026-10-21T03:00:00Z", pageId: "9", pageName: null, seen: [], fresh: ["n"],
        ads: [AD("old", "2026-10-15"), AD("a2", "2026-10-20"), AD("a6", "2026-10-16", { format: "image" }), AD("n", null), AD("x", null)],
      },
    }));
  };

  it("reads the ads that started in the last 7 days, longest-running first, with an undated new one from its check", () => {
    setAds();
    expect(newAds(UID, NOW).map((a) => [a.id, a.days, a.advertiser])).toEqual([["a6", 6, "Owl Planners"], ["a2", 2, "Owl Planners"], ["n", 1, "Owl Planners"]]);
  });

  it("calls idea-dump answer once with the new ads and its context, then writes the ad line, 3 angles and Write this chips", async () => {
    setAds();
    fn.answers["idea-dump"] = { ad: "a2", angles: [{ title: "First angle here", line: "Line one." }, { title: "Second angle here", line: "Line two." }, { title: "Third angle here", line: "Line three." }], scored: true };
    const r = await runSkill(UID, "answer", {}, NOW);
    expect(fn.calls).toHaveLength(1);
    expect(fn.calls[0].name).toBe("idea-dump");
    expect(fn.calls[0].body).toMatchObject({ mode: "answer", ads: [{ id: "a6" }, { id: "a2" }, { id: "n" }], context: { speaker: expect.any(String) } });
    expect(r.lines).toEqual(['Owl Planners started "Headline a2" 2 days ago (video).', "1. First angle here: Line one.", "2. Second angle here: Line two.", "3. Third angle here: Line three."]);
    expect(r.links[0]).toEqual({ label: "Write this: First angle here", path: "/generate?pillar=topic&detail=First+angle+here%3A+Line+one.&ctx=A+reply+to+a+competitor%27s+video+ad+that+has+run+2+days." });
    expect(r.links.every((l) => !l.path.includes("Owl") && !l.path.includes("Headline"))).toBe(true);
    expect(loadSkillRuns(UID)).toEqual([r]);
    expect(activity()[0].uses).toEqual({ feature: "skill-answer", n: 1 });
  });

  it("says when there is no new ad, calling nothing; a failed call saves nothing and says why", async () => {
    expect((await runSkill(UID, "answer", {}, NOW)).lines).toEqual(["No new competitor ads this week."]);
    expect(fn.calls).toEqual([]);
    setAds();
    store.delete(runsKey(UID));
    fn.answers["idea-dump"] = new Error("You've used all 10 for today. It resets at 8am Singapore time.");
    const r = await runSkill(UID, "answer", {}, NOW);
    expect(r).toMatchObject({ id: "", failed: "You've used all 10 for today. It resets at 8am Singapore time." });
    expect(loadSkillRuns(UID)).toEqual([]);
  });
});

describe("results", () => {
  it("keeps the newest 30, newest first, and marks one seen", async () => {
    for (let i = 0; i < MAX_RUNS + 2; i++) await runSkill(UID, "check-week", {}, new Date(NOW.getTime() + i * 60_000));
    const runs = loadSkillRuns(UID);
    expect(runs).toHaveLength(30);
    expect(JSON.parse(store.get(runsKey(UID))!)).toHaveLength(30);
    expect(runs[0].at).toBe(new Date(NOW.getTime() + 31 * 60_000).toISOString());
    expect(runs.every((r, i) => i === 0 || r.at < runs[i - 1].at)).toBe(true);
    expect(runs[0].seen).toBeUndefined();
    markSeen(UID, runs[0].id);
    expect(loadSkillRuns(UID)[0].seen).toBe(true);
  });

  it("reads empty on bad JSON and lists the four ready-made skills in order", () => {
    store.set(runsKey(UID), "{nope");
    expect(loadSkillRuns(UID)).toEqual([] as SkillRun[]);
    expect(BUILT_IN_SKILLS.map((s) => [s.id, s.slash, s.needs])).toEqual([["check", "check", "post"], ["retro", "retro", "none"], ["check-week", "check-week", "none"], ["answer", "answer", "none"]]);
  });
});
