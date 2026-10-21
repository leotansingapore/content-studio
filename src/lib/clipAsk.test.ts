import { beforeEach, describe, expect, it, vi } from "vitest";

// the clips function: what the server answers, and what it was sent
const fn = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[], answer: null as unknown }));
vi.mock("@/lib/edgeFn", async (orig) => ({
  ...(await orig<typeof import("@/lib/edgeFn")>()),
  callFn: async (_name: string, body: Record<string, unknown>) => {
    fn.calls.push(body);
    return fn.answer;
  },
}));

import { clipPlan, findClipsFor, findFailed, findRunning, foundFor, onClipFind, planIssue, presetLook, runClipAsk, setClipAsk, skillLook, startFind, startLook, takeAskedLanding, takeClipAsk, type FoundClip } from "./clipAsk";
import { formatJobs } from "./formatJob";
import { PRESETS } from "./stylePresets";
import { defaultSettings, withLook } from "./videoEdit";
import type { VideoProject } from "./videoProjects";
import type { VideoSkill } from "./videoSkills";

vi.mock("@/lib/supabase", () => ({ supabase: {}, SUPABASE_ANON_KEY: "", SUPABASE_URL: "" }));
vi.mock("@/lib/videoMedia", () => ({ deleteFile: async () => {}, putFile: async () => {}, getFile: async () => undefined, encodeWav: () => new Blob() }));

const mem = new Map<string, string>();
const storage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};
vi.stubGlobal("localStorage", storage);
vi.stubGlobal("window", { localStorage: storage });

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const words = Array.from({ length: 40 }, (_, i) => ({ w: i % 8 === 7 ? "end." : "word", s: i * 2, e: i * 2 + 1.5 }));
const project = (id: string): VideoProject => ({ id, name: "Webinar", createdAt: "", updatedAt: "", duration: 3000, size: 1, words, settings: defaultSettings("bold"), thumb: "" });
const clip = { start: 10, end: 40, title: "Why bills grow", hook: "Bills grow", reason: "", score: 80, parts: { alone: 90, opening: 70 } };

beforeEach(() => {
  mem.clear();
  fn.calls.length = 0;
  fn.answer = { clips: [clip] };
});

describe("the panel's ask", () => {
  it("is read once for its recording and ignored for another", () => {
    setClipAsk("v1", { userId: UID, about: "hospital bills", length: "short" });
    expect(takeClipAsk("v2")).toBeNull();
    expect(takeClipAsk("v1")).toEqual({ userId: UID, about: "hospital bills", length: "short" });
    expect(takeClipAsk("v1")).toBeNull();
    expect(formatJobs().find((j) => j.slug === "clips")).toMatchObject({ state: "working", step: "Captioning", href: "/edit?p=v1" });
  });

  it("runs the find by itself once the words are saved, with the topic and length, and lands once on #clips", async () => {
    const { saveProject } = await import("./videoProjects");
    saveProject(UID, project("v3"));
    setClipAsk("v3", { userId: UID, about: "hospital bills", length: "short" });
    runClipAsk("v3");
    expect(findRunning("v3")).not.toBeNull();
    await findRunning("v3");
    expect(fn.calls).toHaveLength(1);
    expect(fn.calls[0]).toMatchObject({ mode: "clips", about: "hospital bills", length: "short", duration: 3000 });
    expect(foundFor("v3").map((f) => f.clip.title)).toEqual(["Why bills grow"]);
    expect(takeAskedLanding("v3")).toBe(true);
    expect(takeAskedLanding("v3")).toBe(false);
    expect(formatJobs().find((j) => j.slug === "clips")).toMatchObject({ state: "ready", href: "/edit?p=v3#clips" });
    // read once: a second run finds nothing to do
    runClipAsk("v3");
    expect(fn.calls).toHaveLength(1);
  });
});

describe("the find", () => {
  it("keeps a recording's list after the component is gone, and saves each clip as a project on the same file", async () => {
    const made = await findClipsFor(UID, project("v4"), words, defaultSettings("bold"), "", "auto");
    expect(fn.calls[0]).not.toHaveProperty("length");
    expect(fn.calls[0].about).toBeUndefined();
    expect(made[0].project).toMatchObject({ fileId: "v4", name: "Webinar - Why bills grow", settings: { trimStart: 10, trimEnd: 2960, hook: "Bills grow" } });
    await startFind("v4", async () => made);
    expect(foundFor("v4")).toBe(made);
    const { loadProjects } = await import("./videoProjects");
    expect(loadProjects(UID).map((p) => p.id)).toContain(made[0].project.id);
  });

  it("reads as running until it settles, and a second start gets the same promise", async () => {
    let done: (v: FoundClip[]) => void = () => {};
    const run = vi.fn(() => new Promise<FoundClip[]>((r) => (done = r)));
    const told = vi.fn();
    const off = onClipFind(told);
    const a = startFind("v5", run);
    const b = startFind("v5", run);
    expect(b).toBe(a);
    expect(run).toHaveBeenCalledTimes(1);
    expect(findRunning("v5")).toBe(a);
    done([]);
    await a;
    expect(findRunning("v5")).toBeNull();
    expect(told).toHaveBeenCalledTimes(2);
    off();
  });

  it("keeps a failure with what it asked, for Try again, and clears it on the next start", async () => {
    const { EdgeError } = await import("./edgeFn");
    await startFind("v6", async () => { throw new EdgeError("No clips stood out in this video. Try a longer one.", 422); }, { about: "bills", length: "short" }).catch(() => {});
    expect(findFailed("v6")).toEqual({ error: "No clips stood out in this video. Try a longer one.", code: "422", about: "bills", length: "short" });
    await startFind("v6", async () => []);
    expect(findFailed("v6")).toBeNull();
  });
});

describe("the look a recording starts with", () => {
  const skill = (id: string, isDefault: boolean, look: Record<string, unknown>, prompt = ""): VideoSkill => ({ id, name: id, look, prompt, isDefault, updatedAt: "" }) as VideoSkill;
  const skills = [skill("mine", true, { style: "minimal" }, "cut the pauses"), skill("other", false, { style: "cutout" })];

  it("leaves the default skill's look and its instructions, as an upload does today", () => {
    const s = startLook(skills, "");
    expect(s.skill?.id).toBe("mine");
    expect(s.settings).toEqual(withLook(defaultSettings("bold"), { style: "minimal" }));
    expect(startLook([], "")).toEqual({ settings: defaultSettings("bold"), skill: null });
  });

  it("takes a picked skill, or a preset's recipe with no skill to run", () => {
    expect(startLook(skills, skillLook("other")).skill?.id).toBe("other");
    const punchy = PRESETS[0];
    const p = startLook(skills, presetLook(punchy.id));
    expect(p.skill).toBeNull();
    expect(p.settings).toMatchObject({ style: punchy.recipe.style, wordsPerCaption: punchy.recipe.wordsPerCaption });
    // a skill that is gone falls back to the default
    expect(startLook(skills, skillLook("gone")).skill?.id).toBe("mine");
  });
});

describe("the plan line", () => {
  it("counts captioning parts and finding passes", () => {
    expect(clipPlan(50 * 60)).toEqual({ captions: 5, finds: 2 });
    expect(clipPlan(5 * 60)).toEqual({ captions: 1, finds: 1 });
  });

  it("names whichever is short, clip finding first, and nothing when the uses aren't read", () => {
    const plan = { captions: 5, finds: 2 };
    expect(planIssue(plan, { captions: 30, finds: 20 })).toBeNull();
    expect(planIssue(plan, { captions: null, finds: null })).toBeNull();
    expect(planIssue(plan, { captions: 30, finds: 0 })).toBe("Clip finding: none left today. It resets at 8am Singapore time.");
    expect(planIssue(plan, { captions: 3, finds: 20 })).toBe("Captioning: 3 left today, this needs 5. It resets at 8am Singapore time.");
    expect(planIssue(plan, { captions: 0, finds: 1 })).toBe("Clip finding: 1 left today, this needs 2. It resets at 8am Singapore time.");
  });
});
