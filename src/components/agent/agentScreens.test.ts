// The agent screens' own logic (agent-page): the slash menu's rows, the run and meta lines, the thread list's groups,
// the MADE block's warnings, and the dock's hidden pages. The engine (agentRun), the starters and the skills are other
// tasks' modules: faked here, so these tests read only this code. A card's Approve words and blocked reason are the
// engine's (agentPlans.test.ts).
import { afterEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ drafts: [] as unknown[] }));
vi.mock("@/lib/agentRun", () => ({ send: vi.fn(), stop: vi.fn(), turnOf: () => null, onAgent: () => () => undefined, press: vi.fn(), editCard: vi.fn(), undoReceipt: vi.fn(), resumeAgent: vi.fn() }));
vi.mock("@/lib/agentStarters", () => ({ starterChips: () => [] }));
vi.mock("@/lib/chatSkills", () => ({ BUILT_IN_SKILLS: [], loadMySkills: () => [] }));
vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", supabase: { auth: {}, from: () => ({}) } }));
vi.mock("@/lib/draftHistory", async (actual) => ({ ...(await actual<typeof import("@/lib/draftHistory")>()), loadDrafts: () => store.drafts }));

import { ENGINE_CHIP, metaLine, runLabel } from "./AgentThread";
import { isAppPath } from "./dockActions";
import { ownComposer } from "./AgentDock";
import { MAS_LINE, madeNoun, madeWarnings, tookWords } from "./MadeBlock";
import { slashItems } from "./SlashMenu";
import { lastLine, whenGroup } from "./ThreadList";
import type { AgentCard } from "@/lib/agentCards";
import type { AgentThread } from "@/lib/agentThreads";

afterEach(() => {
  store.drafts = [];
});

const SKILLS = [
  { slash: "check", name: "Check before posting" },
  { slash: "retro", name: "Weekly retro" },
  { slash: "check-week", name: "Check this week's posts" },
  { slash: "answer", name: "Answer a competitor's new ad" },
  { slash: "/tighten", name: "Tighten for LinkedIn" },
  { slash: "hooks", name: "Three hooks" },
  { slash: "cta", name: "A softer ending" },
];

describe("slash menu", () => {
  it("lists up to 6 skills while the text is a bare slash", () => {
    expect(slashItems("/", SKILLS).map((s) => s.slash)).toEqual(["check", "retro", "check-week", "answer", "tighten", "hooks"]);
  });
  it("matches the slash or the name, and drops a leading slash from saved ones", () => {
    expect(slashItems("/che", SKILLS).map((s) => s.slash)).toEqual(["check", "check-week"]);
    expect(slashItems("/linked", SKILLS)).toEqual([{ slash: "tighten", name: "Tighten for LinkedIn" }]);
  });
  it("stays shut once a word follows, or without a slash", () => {
    expect(slashItems("/check ", SKILLS)).toEqual([]);
    expect(slashItems("check", SKILLS)).toEqual([]);
    expect(slashItems("/nothing", SKILLS)).toEqual([]);
  });
  it("shows a slash once even when two skills share it", () => {
    expect(slashItems("/check", [...SKILLS, { slash: "check", name: "Mine" }]).filter((s) => s.slash === "check")).toHaveLength(1);
  });
});

const card = (over: Partial<AgentCard>): AgentCard => ({
  id: "k1",
  kind: "video",
  title: "Talking video",
  line: "",
  needs: [{ feature: "ai-video", n: 1 }],
  plan: {},
  status: "proposed",
  proposedAt: "2026-10-22T14:25:00.000Z",
  ...over,
});
describe("run and meta lines", () => {
  it("counts a live turn's seconds and drops them for a stored one", () => {
    expect(runLabel("starting", 0)).toBe("Starting");
    expect(runLabel("thinking", 3)).toBe("Thinking 3s");
    expect(runLabel("writing", 9)).toBe("Writing 9s");
    expect(runLabel("thinking", null)).toBe("Thinking");
    expect(runLabel("making", 4, "Making the voiceover...")).toBe("Making | Making the voiceover...");
  });
  it("reads time, steps and seconds", () => {
    const at = new Date(2026, 9, 22, 22, 41).toISOString();
    expect(metaLine(at, { steps: 2, ms: 14200 })).toBe("22:41 | 2 steps | 14.2s");
    expect(metaLine(at, { steps: 1, ms: 1400 })).toBe("22:41 | 1 step | 1.4s");
    expect(metaLine(at, { steps: 0, ms: 1200 })).toBe("22:41 | 1.2s");
  });
});

describe("chips under a message", () => {
  it("draws a chip only as an app link or one of the engine's own, never an outside path", () => {
    const drawn = (p: string) => isAppPath(p) || ENGINE_CHIP.test(p);
    expect(["/campaigns/c-1?post=2", "say:Write a script about CPF", "format:carousel", "forget:l2", 'fb:{"type":"support"}'].every(drawn)).toBe(true);
    expect(["/\t/evil.example", "/\n/evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", " /home", "https://evil.example"].some(drawn)).toBe(false);
  });
});

describe("thread list", () => {
  const now = new Date(2026, 9, 22, 9, 0);
  it("groups by the day of the last change", () => {
    expect(whenGroup(new Date(2026, 9, 22, 0, 5).toISOString(), now)).toBe("Today");
    expect(whenGroup(new Date(2026, 9, 21, 23, 59).toISOString(), now)).toBe("Yesterday");
    expect(whenGroup(new Date(2026, 9, 20, 12, 0).toISOString(), now)).toBe("Earlier");
  });
  it("shows the last words, 60 characters at most", () => {
    const t = (messages: object[]) => ({ id: "t1", title: "x", createdAt: "", updatedAt: "", messages }) as AgentThread;
    expect(lastLine(t([{ id: "m1", at: "", role: "agent", text: "a ".repeat(50) }]))).toHaveLength(60);
    expect(lastLine(t([{ id: "m1", at: "", role: "user", text: "hi" }, { id: "m2", at: "", role: "agent", turn: "thinking" }]))).toBe("hi");
    expect(lastLine(t([{ id: "m1", at: "", role: "agent", card: card({ title: "Add Finch as a competitor" }) }]))).toBe("Add Finch as a competitor");
  });
});

describe("MADE block", () => {
  const draft = (flags: object | undefined, words = "Plan your CPF LIFE payouts.") => ({ id: "d1", hook: "CPF LIFE", draft: words, remix: { keep: "", as: "post", close: "", flags } });
  it("shows the MAS line when Jev flagged the words, and nothing else", () => {
    store.drafts = [draft({ copied: [], claim: false, invented: false, mas: true }, "guaranteed returns")];
    expect(madeWarnings("u1", "d1")).toEqual([MAS_LINE]);
  });
  it("shows nothing when Jev cleared them", () => {
    store.drafts = [draft({ copied: [], claim: false, invented: false, mas: false }, "guaranteed returns")];
    expect(madeWarnings("u1", "d1")).toEqual([]);
  });
  it("falls back on the keyword check when Jev gave no answer", () => {
    store.drafts = [draft({ copied: [], claim: false, invented: false, mas: null }, "These are guaranteed returns.")];
    expect(madeWarnings("u1", "d1")[0]).toMatch(/^Check: ".+" is flagged\.$/);
    store.drafts = [draft(undefined)];
    expect(madeWarnings("u1", "d1")).toEqual([]);
    expect(madeWarnings("u1", "gone")).toEqual([]);
  });
  it("names the format and the time it took", () => {
    expect(madeNoun({ kind: "remix", state: "done", startedAt: "", open: "/carousel?draft=d1" })).toBe("carousel");
    expect(madeNoun({ kind: "remix", state: "done", startedAt: "", open: "/generate?draft=d1" })).toBe("post");
    expect(madeNoun({ kind: "talk", state: "done", startedAt: "" })).toBe("talking video");
    expect(tookWords({ startedAt: "2026-10-22T10:00:00Z", endedAt: "2026-10-22T10:00:14Z" })).toBe("14s");
    expect(tookWords({ startedAt: "2026-10-22T10:00:00Z", endedAt: "2026-10-22T10:03:43Z" })).toBe("3m 43s");
  });
});

describe("agent dock", () => {
  it("hides its launcher on the pages with their own composer", () => {
    expect(["/home", "/agent", "/agent/t1"].map(ownComposer)).toEqual([true, true, true]);
    expect(["/drafts", "/agents", "/homepage"].map(ownComposer)).toEqual([false, false, false]);
  });
});
