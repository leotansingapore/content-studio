import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) }, functions: { invoke: vi.fn() }, from: vi.fn() },
}));

import { canFix, changedParts, faceFor, fixedProject, loadScriptDraft, saveScriptDraft, textsFromSpans, tooLongLine, wordsIn } from "./avatarScript";
import { defaultSettings, type Word } from "./videoEdit";
import type { AiMark, VideoProject } from "./videoProjects";
import type { Remake } from "./aiVideo";

const W = (w: string, s: number, e: number): Word => ({ w, s, e });
const parts = [
  { text: "", start: 0, end: 4, clip: "ai-slice-j1-0-0" },
  { text: "", start: 4, end: 9, clip: "ai-slice-j1-1-0" },
  { text: "", start: 9, end: 13, clip: "ai-slice-j1-2-0" },
];
const mark: AiMark = { kind: "avatar", person: "presenter", who: "pr-a1", voice: "premade", voiceId: "alice", madeAt: "2026-10-22T01:00:00.000Z", slices: parts };

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  });
});

describe("each part's words", () => {
  it("come from Whisper's words, each going to the part its middle falls in", () => {
    const words = [W("Most", 0.2, 0.6), W("people", 0.6, 1.1), W("overpay.", 3.8, 4.4), W("They", 4.3, 4.7), W("plan.", 8.7, 9.2), W("Check", 9.4, 9.8)];
    expect(wordsIn(words, parts)).toEqual(["Most people", "overpay. They plan.", "Check"]);
    expect(wordsIn([], parts)).toEqual(["", "", ""]);
  });

  it("come from a dub's spans, each line to the part where it is said, Chinese with no spaces", () => {
    const spans = [{ s: 0.3, e: 3.1 }, null, { s: 3.4, e: 5.2 }, { s: 9.6, e: 12 }];
    expect(textsFromSpans(spans, ["Satu.", "Dua.", "Tiga.", "Empat."], parts)).toEqual(["Satu.", "Tiga.", "Empat."]);
    expect(textsFromSpans(spans, ["一。", "二。", "三。", "四。"], [parts[0], { ...parts[1], end: 13 }], "zh")).toEqual(["一。", "三。四。"]);
    expect(textsFromSpans(spans, ["Satu.", "Dua.", "  ", "Empat."], parts)).toEqual(["Satu.", "", "Empat."]);
  });
});

describe("what was edited", () => {
  it("finds only the edited part, spacing aside", () => {
    const base = ["Most people overpay.", "They need a plan.", "Check yours."];
    expect(changedParts(base, [" Most  people overpay. ", "They need one plan.", "Check yours."])).toEqual([1]);
    expect(changedParts(base, [])).toEqual([]);
    expect(changedParts(base, [undefined as unknown as string, "They need a plan.", "Check it."])).toEqual([2]);
  });

  it("refuses a new line over 9.5 seconds", () => {
    expect(tooLongLine(9.5)).toBeNull();
    expect(tooLongLine(10.24)).toBe("That line runs 10.2s. Keep each part under 9.5 seconds, or split it.");
  });

  it("fixes only a kept face's video that has its parts", () => {
    expect(canFix(mark)).toBe(true);
    expect(canFix({ ...mark, person: "mine" })).toBe(true);
    expect(canFix({ ...mark, person: "generated" })).toBe(false);
    expect(canFix({ ...mark, slices: undefined })).toBe(false);
    expect(canFix(undefined)).toBe(false);
  });

  it("keeps typed edits and a review on this device, and drops junk", () => {
    saveScriptDraft("v1", { edits: ["a", "b"], review: { lang: "zh", lines: ["一", "二"] } });
    expect(loadScriptDraft("v1")).toEqual({ edits: ["a", "b"], review: { lang: "zh", lines: ["一", "二"] } });
    localStorage.setItem("cs-script-v2", JSON.stringify({ edits: [1], review: { lang: "fr", lines: ["x"] }, heard: ["ok"] }));
    expect(loadScriptDraft("v2")).toEqual({ heard: ["ok"] });
    localStorage.setItem("cs-script-v3", "{nope");
    expect(loadScriptDraft("v3")).toEqual({});
    saveScriptDraft("v1", {});
    expect(localStorage.getItem("cs-script-v1")).toBeNull();
  });
});

describe("the face to make it on again", () => {
  const JPEG = "data:image/jpeg;base64,/9j/AAAA";
  const presenter = (createdAt: string, status = "on") => ({ id: "pr-a1", name: "Mei", look: "A Chinese Singaporean woman", url: "https://hf.example/p1.jpg", photo: status === "on" ? JPEG : "", createdAt, status });
  const NOW = Date.parse("2026-10-22T00:00:00.000Z");

  it("is the presenter's link while Higgsfield keeps it, then its copy, and nothing once removed", async () => {
    localStorage.setItem("content-studio-presenters-u1", JSON.stringify({ who: "ask", prefs: {}, items: [presenter("2026-10-20T00:00:00.000Z")] }));
    expect(faceFor("u1", mark, NOW)).toBe("https://hf.example/p1.jpg");
    localStorage.setItem("content-studio-presenters-u1", JSON.stringify({ who: "ask", prefs: {}, items: [presenter("2026-10-10T00:00:00.000Z")] }));
    const copy = faceFor("u1", mark, NOW) as Blob;
    expect(copy.type).toBe("image/jpeg");
    expect([...new Uint8Array(await copy.arrayBuffer())].slice(0, 3)).toEqual([0xff, 0xd8, 0xff]);
    localStorage.setItem("content-studio-presenters-u1", JSON.stringify({ who: "ask", prefs: {}, items: [presenter("2026-10-20T00:00:00.000Z", "off")] }));
    expect(faceFor("u1", mark, NOW)).toBeNull();
    expect(faceFor("u1", { ...mark, who: "pr-zz" }, NOW)).toBeNull();
  });

  it("is your saved face only while it is on and the one the video was made from", () => {
    const face = { id: "face-k1", photo: JPEG, photoHash: "a".repeat(64), consent: { at: "2026-10-21T00:00:00.000Z", line: "I'm the person on camera.", heard: "4 8 2 1", token: "t.k" }, status: "on", history: [] };
    localStorage.setItem("content-studio-myface-u1", JSON.stringify(face));
    const mine: AiMark = { ...mark, person: "mine", who: "face-k1", voice: undefined, voiceId: undefined };
    expect(faceFor("u1", mine, NOW)).toBeInstanceOf(Blob);
    expect(faceFor("u1", { ...mine, who: "face-old" }, NOW)).toBeNull();
    localStorage.setItem("content-studio-myface-u1", JSON.stringify({ ...face, photo: "", status: "off" }));
    expect(faceFor("u1", mine, NOW)).toBeNull();
  });
});

describe("laying a finished fix into the project", () => {
  const project: VideoProject = {
    id: "v1", name: "Clip", createdAt: "2026-10-22T00:00:00.000Z", updatedAt: "", duration: 13.04, size: 9000, thumb: "data:image/jpeg;base64,x",
    words: [W("Most", 0.2, 0.6), W("They", 4.3, 4.7), W("Check", 9.4, 9.8)],
    settings: { ...defaultSettings("bold"), removed: [{ s: 9.4, e: 9.8 }] }, ai: mark,
  };
  const remake: Remake = {
    projectId: "v1", base: "v1", parts: parts.map((p, i) => ({ ...p, text: ["Most", "They", "Check"][i] })),
    changes: [{ i: 1, text: "They need one plan.", seconds: 6 }], tokens: ["t0"], done: { fileId: "v1-s1", size: 9500, clips: ["ai-slice-j1-1-1"] },
  };

  it("puts the new video under the project with the changed part's words and clip, and the rest moved after it", () => {
    const next = fixedProject(project, remake)!;
    expect(next).toMatchObject({ id: "v1", fileId: "v1-s1", size: 9500, duration: 14.04, thumb: project.thumb });
    expect(next.ai!.slices!.map((s) => [s.text, s.start, s.end, s.clip])).toEqual([
      ["Most", 0, 4, "ai-slice-j1-0-0"], ["They need one plan.", 4, 10, "ai-slice-j1-1-1"], ["Check", 10, 14, "ai-slice-j1-2-0"],
    ]);
    expect(next.words.map((x) => x.w)).toEqual(["Most", "They", "need", "one", "plan.", "Check"]);
    expect(next.words.at(-1)).toEqual(W("Check", 10.4, 10.8));
    // what was measured on the old picture and sound goes, as when a video is swapped
    expect(next.settings.removed).toBeUndefined();
    expect(next.ai).toMatchObject({ kind: "avatar", person: "presenter", who: "pr-a1" });
  });

  it("is never laid on a video swapped since, nor before the fix is put together", () => {
    expect(fixedProject({ ...project, fileId: "v1-s1" }, remake)).toBeNull();
    expect(fixedProject(project, { ...remake, done: undefined })).toBeNull();
    expect(fixedProject({ ...project, ai: { ...mark, slices: parts.slice(0, 2) } }, remake)).toBeNull();
  });
});
