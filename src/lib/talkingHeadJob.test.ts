import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
const fn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("./edgeFn")>()), callFn: fn }));
const speak = vi.hoisted(() => vi.fn());
vi.mock("@/lib/textVoice", async (orig) => ({ ...(await orig<typeof import("./textVoice")>()), speak }));
// aiVideo's job store, faked: makePresenter and makeAvatar move it the way the real ones do
const ai = vi.hoisted(() => {
  type J = { kind: string; state: string; step: string; error?: string; url?: string } | null;
  let job: J = null;
  const ls = new Set<(j: J) => void>();
  return {
    pending: null as unknown,
    get: () => job,
    set: (j: J) => {
      job = j;
      ls.forEach((l) => l(j && { ...j }));
    },
    on: (f: (j: J) => void) => {
      ls.add(f);
      return () => void ls.delete(f);
    },
    reset() {
      job = null;
      ls.clear();
      this.pending = null;
    },
    makeAvatar: vi.fn(),
    makePresenter: vi.fn(),
    slice: vi.fn(),
    resume: vi.fn(),
  };
});
vi.mock("@/lib/aiVideo", () => ({
  aiJob: () => ai.get(),
  aiBusy: () => ai.get()?.state === "working",
  onAiJob: ai.on,
  pendingAvatar: () => ai.pending,
  resumeAvatar: ai.resume,
  sliceVoiceover: ai.slice,
  makePresenter: ai.makePresenter,
  makeAvatar: ai.makeAvatar,
}));

import { EdgeError } from "./edgeFn";
import { formatJobs } from "./formatJob";
import { saveFace, turnOffFace } from "./myFace";
import { keepPresenter, removePresenter } from "./presenters";
import type { RemixSource } from "./remixSource";
import { TALK_TOAST, loadTyped, saveTyped, type TalkWho } from "./talkingHead";
import { JOINING, NO_FACE, PRESENTER_GONE, dropTalk, goOnAtPrice, madePresenter, onTalkJob, resumeTalk, startTalk, talkJob, writeTalk, type TalkAsk } from "./talkingHeadJob";

const SCRIPT = "Honestly, most of us lose deals in the follow-up, not the pitch. So here's what I do every morning before nine. I list three people to call back and I call them first. Try it this week.";
const ASK: TalkAsk = { source: null, text: "Why follow-ups win deals", who: "presenter", photo: null, look: "A Malay Singaporean man in his late 30s, light blue shirt", setting: "car", voice: "george", length: 15, mention: true };
const voiceOf = (seconds: number, slices: number[]) => {
  let at = 0;
  return { pcm: new Float32Array(0), seconds, slices: slices.map((s) => ({ start: at, end: (at += s) })) };
};

let order: string[];
let steps: string[];
let off: () => void;
beforeEach(() => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
  dropTalk();
  ai.reset();
  order = [];
  fn.mockReset().mockImplementation(async (name: string, body: { mode: string; as: string; seconds?: number; topic?: string }) => {
    order.push(`${name} ${body.mode} ${body.as} ${body.seconds}`);
    return { result: { as: "speaking", script: SCRIPT, caption: "Three calls before nine. #sales" }, flags: { copied: [], claim: false, invented: false } };
  });
  ai.makePresenter.mockReset().mockImplementation(async (look: string, setting: string) => {
    order.push(`presenter ${setting}`);
    ai.set({ kind: "presenter", state: "working", step: "Making your presenter..." });
    await Promise.resolve();
    ai.set({ kind: "presenter", state: "done", step: "", url: `https://cdn.example/${setting}.png` });
  });
  speak.mockReset().mockImplementation(async (text: string, voice: string) => {
    order.push(`speak ${voice}`);
    return new Blob([text]);
  });
  ai.slice.mockReset().mockResolvedValue(voiceOf(16, [9.5, 6.5]));
  ai.makeAvatar.mockReset().mockImplementation(async () => {
    order.push("avatar");
    ai.set({ kind: "avatar", state: "working", step: "Sending your voiceover and photo..." });
    await Promise.resolve();
    ai.set({ kind: "avatar", state: "working", step: "Making your video, 0 of 2 parts ready. This takes a few minutes." });
    await Promise.resolve();
    ai.set({ kind: "avatar", state: "working", step: JOINING });
    await Promise.resolve();
    ai.set({ kind: "avatar", state: "done", step: "" });
  });
  ai.resume.mockReset();
  steps = [];
  off = onTalkJob((j) => j && steps[steps.length - 1] !== `${j.state}:${j.step}` && steps.push(`${j.state}:${j.step}`));
});
afterEach(() => {
  off();
  vi.unstubAllGlobals();
});

describe("one press", () => {
  it("writes from the topic, makes the presenter in its setting, voices it and makes the video, in that order", async () => {
    await startTalk("u1", ASK);
    expect(order).toEqual(["remix make speaking 15", "presenter car", "speak george", "avatar"]);
    expect(steps).toEqual([
      "writing:Writing your script...",
      "presenter:Making your presenter...",
      "voice:Making the voiceover...",
      "video:Sending your voiceover and photo...",
      "video:Making your video, 0 of 2 parts ready. This takes a few minutes.",
      `joining:${JOINING}`,
      "done:",
    ]);
    // the topic goes as the topic, with the length's seconds
    expect(fn.mock.calls[0][1]).toMatchObject({ mode: "make", as: "speaking", topic: "Why follow-ups win deals", seconds: 15 });
    // the written script is spoken, and the presenter's picture and the toast ride to the editor
    expect(speak).toHaveBeenCalledWith(SCRIPT, "george");
    const [name, face, , extra] = ai.makeAvatar.mock.calls[0];
    expect(name).toBe(SCRIPT.slice(0, 40));
    expect(face).toBe("https://cdn.example/car.png");
    // the script the voice says rides along, so the editor captions it from the script and transcribes nothing (live-p5dog D8)
    expect(extra).toEqual({ toast: TALK_TOAST, caption: "Three calls before nine. #sales", said: SCRIPT, ai: { kind: "avatar", person: "generated", voice: "premade", voiceId: "george", madeAt: expect.any(String) } });
    expect(talkJob()).toMatchObject({ state: "done", script: SCRIPT });
    // the script is cleared after a make; the presenter is kept for the next press
    expect(loadTyped("u1").script).toBe("");
    expect(madePresenter(ASK.look, "car")).toBe("https://cdn.example/car.png");
    expect(madePresenter(ASK.look, "kitchen")).toBeNull();
  });

  it("mirrors each step into the library's Making now, linking the page with its params, then the editor", async () => {
    const seen: string[] = [];
    const stop = onTalkJob(() => {
      const f = formatJobs().find((j) => j.slug === "talking-head");
      if (f) seen.push(`${f.state} ${f.step ?? ""} ${f.href}`);
    });
    await startTalk("u1", { ...ASK, length: 30 });
    stop();
    expect(seen[0]).toBe("working Writing your script /make/talking-head?who=presenter&setting=car&length=30&voice=george");
    expect(seen).toContain("working Putting your video together /edit");
    expect(seen[seen.length - 1]).toBe("ready  /edit");
  });

  it("speaks a typed script as it is, with my photo, and writes nothing", async () => {
    const photo = new Blob(["jpg"]);
    await startTalk("u1", { ...ASK, who: "photo", photo, text: SCRIPT });
    expect(order).toEqual(["speak george", "avatar"]);
    expect(steps[0]).toBe("voice:Making the voiceover...");
    expect(ai.makeAvatar.mock.calls[0][1]).toBe(photo);
    expect(ai.makeAvatar.mock.calls[0][3]).toEqual({ toast: TALK_TOAST, said: SCRIPT, ai: { kind: "avatar", person: "generated", voice: "premade", voiceId: "george", madeAt: expect.any(String) } });
  });

  it("keeps a Clone a reel result's own script and caption, writing nothing, and names the source in the editor", async () => {
    const clone = { key: "clone:instagram:C1x", kind: "clone", format: "video", platform: "instagram", author: "@coach", url: "https://www.instagram.com/reel/C1x/", remixedAt: "" } as RemixSource;
    await startTalk("u1", { ...ASK, source: clone, text: "Short clone line.", caption: "Their version's caption" });
    expect(fn).not.toHaveBeenCalled();
    expect(speak).toHaveBeenCalledWith("Short clone line.", "george");
    const extra = ai.makeAvatar.mock.calls[0][3];
    expect(extra).toMatchObject({ toast: TALK_TOAST, caption: "Their version's caption", note: "Remixed from @coach, https://www.instagram.com/reel/C1x/" });
    expect(extra.source).toMatchObject({ key: "clone:instagram:C1x" });
    expect(extra.source.remixedAt).not.toBe("");
  });

  it("writes from a post with the short box as the steer", async () => {
    const post = { key: "trend:t1", kind: "trend", format: "video", title: "Cold calls", remixedAt: "" } as RemixSource;
    await startTalk("u1", { ...ASK, source: post, text: "about follow-ups" });
    expect(fn.mock.calls[0][1]).toMatchObject({ as: "speaking", seconds: 15, note: "about follow-ups", source: { key: "trend:t1" } });
    expect(fn.mock.calls[0][1]).not.toHaveProperty("topic");
  });
});

describe("a press that stops before Speak is paid for", () => {
  it("stops at a failed voiceover, with its words, and never calls makeAvatar", async () => {
    speak.mockRejectedValueOnce(new Error("Couldn't make the voiceover. Try again in a minute."));
    await startTalk("u1", ASK);
    expect(talkJob()).toMatchObject({ state: "failed", error: "Couldn't make the voiceover. Try again in a minute." });
    expect(ai.makeAvatar).not.toHaveBeenCalled();
  });

  it("stops when the real slices cost more than the chip, keeps the voiceover, and goes on with it without voicing again", async () => {
    // 21 s cuts into three slices: 55 credits against the 15 s chip's 44
    const v = voiceOf(21, [9.5, 9.5, 2]);
    ai.slice.mockResolvedValue(v);
    await startTalk("u1", ASK);
    expect(ai.makeAvatar).not.toHaveBeenCalled();
    const j = talkJob()!;
    expect(j.state).toBe("priced");
    expect(j.real?.seconds).toBe(21);
    expect(j.real?.price.usd).toBeCloseTo(55 * 0.0625, 4);
    expect(formatJobs().find((f) => f.slug === "talking-head")).toMatchObject({ state: "working", step: "Waiting for you to check the price" });
    await goOnAtPrice("u1");
    expect(speak).toHaveBeenCalledTimes(1);
    expect(ai.makeAvatar).toHaveBeenCalledTimes(1);
    expect(ai.makeAvatar.mock.calls[0][2]).toBe(v);
    expect(ai.makeAvatar.mock.calls[0][1]).toBe("https://cdn.example/car.png");
    // the mark made at the price check goes with it
    expect(ai.makeAvatar.mock.calls[0][3].ai).toMatchObject({ kind: "avatar", person: "generated", voiceId: "george" });
    expect(talkJob()?.state).toBe("done");
  });

  it("stops only above the card's own quote when the press carries one (live-p5dog day 3: a US$3.44 card stopped again at US$3.44)", async () => {
    ai.slice.mockResolvedValue(voiceOf(18.5, [8.55, 9.04, 0.91]));
    await startTalk("u1", { ...ASK, quoted: 55 * 0.0625 });
    expect(talkJob()?.state).toBe("done");
    expect(ai.makeAvatar).toHaveBeenCalledTimes(1);
    await startTalk("u1", { ...ASK, quoted: 44 * 0.0625 });
    expect(talkJob()?.state).toBe("priced");
    expect(ai.makeAvatar).toHaveBeenCalledTimes(1);
  });

  it("stops a voiceover over 30 seconds with the limit's words", async () => {
    ai.slice.mockResolvedValue(voiceOf(34, [9.5, 9.5, 9.5, 5.5]));
    await startTalk("u1", ASK);
    expect(talkJob()).toMatchObject({ state: "failed", error: "The script runs 34 s, over the 30-second limit. Shorten it, then try again." });
    expect(ai.makeAvatar).not.toHaveBeenCalled();
  });

  it("stops at a refused script with the server's words and pays for nothing else", async () => {
    fn.mockRejectedValueOnce(new EdgeError("That topic can't be turned into something safe to post. Try another one.", 422, "refused"));
    await startTalk("u1", ASK);
    expect(talkJob()).toMatchObject({ state: "failed", refused: true, error: "That topic can't be turned into something safe to post. Try another one." });
    expect(ai.makePresenter).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
  });

  it("stops at a presenter that failed, before the voiceover", async () => {
    ai.makePresenter.mockImplementationOnce(async () => ai.set({ kind: "presenter", state: "failed", step: "", error: "The safety filter blocked it. Try another photo or wording." }));
    // a setting with no presenter made yet this session
    await startTalk("u1", { ...ASK, setting: "cafe" });
    expect(talkJob()).toMatchObject({ state: "failed", error: "The safety filter blocked it. Try another photo or wording." });
    expect(speak).not.toHaveBeenCalled();
  });
});

describe("your saved face or a saved presenter (Leo only)", () => {
  const UID = "u1";
  // stand-ins for an AI-made face and presenter copy, never a real person
  const FACE = `data:image/jpeg;base64,${Buffer.from("face-jpeg-bytes").toString("base64")}`;
  const COPY = `data:image/jpeg;base64,${Buffer.from("presenter-copy-bytes").toString("base64")}`;
  const LINK = "https://cdn.higgsfield.ai/soul/mei.png";
  const at = new Date(Date.UTC(2026, 9, 22, 1, 0, 0));
  const saveMyFace = () => {
    const r = saveFace(UID, { photo: FACE, photoHash: "ab".repeat(32), consent: { at: at.toISOString(), line: "I'm the person on camera.", heard: "4 8 2 1", token: "t.k" } }, at);
    if (r.ok === false) throw new Error(r.error);
    return r.face;
  };
  const keepMei = () => {
    const r = keepPresenter(UID, { name: "Mei", look: "A Chinese Singaporean woman in her early 30s", url: LINK, photo: COPY }, at);
    if (r.ok === false) throw new Error(r.error);
    return r.presenter;
  };
  const MINE: TalkAsk = { ...ASK, who: "mine", text: SCRIPT };

  it("speaks with your saved face, makes no presenter, and marks the video as yours", async () => {
    const f = saveMyFace();
    await startTalk(UID, MINE);
    expect(order).toEqual(["speak george", "avatar"]);
    expect(ai.makePresenter).not.toHaveBeenCalled();
    const [, face, , extra] = ai.makeAvatar.mock.calls[0];
    expect(face).toBeInstanceOf(Blob);
    expect(await (face as Blob).text()).toBe("face-jpeg-bytes");
    expect(extra.ai).toEqual({ kind: "avatar", person: "mine", who: f.id, voice: "premade", voiceId: "george", madeAt: expect.any(String) });
    expect(talkJob()?.params.who).toBe("mine");
  });

  it("stops before anything is paid when your face is off", async () => {
    saveMyFace();
    turnOffFace(UID);
    await startTalk(UID, MINE);
    expect(talkJob()).toMatchObject({ state: "failed", error: NO_FACE });
    expect(speak).not.toHaveBeenCalled();
    expect(ai.makeAvatar).not.toHaveBeenCalled();
  });

  it("sends a saved presenter's link while it answers, and its copy once it doesn't", async () => {
    const mei = keepMei();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("png", { status: 200 })));
    await startTalk(UID, { ...MINE, who: mei.id as TalkWho });
    expect(fetch).toHaveBeenCalledWith(LINK);
    expect(ai.makeAvatar.mock.calls[0][1]).toBe(LINK);
    expect(ai.makeAvatar.mock.calls[0][3].ai).toMatchObject({ person: "presenter", who: mei.id as TalkWho });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 })));
    await startTalk(UID, { ...MINE, who: mei.id as TalkWho });
    const copy = ai.makeAvatar.mock.calls[1][1];
    expect(copy).toBeInstanceOf(Blob);
    expect(await (copy as Blob).text()).toBe("presenter-copy-bytes");
  });

  it("stops before anything is paid when the presenter was removed", async () => {
    const mei = keepMei();
    removePresenter(UID, mei.id);
    await startTalk(UID, { ...MINE, who: mei.id as TalkWho });
    expect(talkJob()).toMatchObject({ state: "failed", error: PRESENTER_GONE });
    expect(speak).not.toHaveBeenCalled();
  });
});

describe("a paid video", () => {
  it("marks a failed video that is still paid for, so Try again at no cost can pick it up", async () => {
    ai.makeAvatar.mockImplementationOnce(async () => {
      ai.set({ kind: "avatar", state: "working", step: "Sending your voiceover and photo..." });
      ai.pending = { name: "x", tokens: ["t1"], seconds: [9.5], extra: { toast: TALK_TOAST } };
      await Promise.resolve();
      ai.set({ kind: "avatar", state: "failed", step: "", error: "It was made but didn't download. Try again." });
    });
    await startTalk("u1", ASK);
    expect(talkJob()).toMatchObject({ state: "failed", waiting: true, error: "It was made but didn't download. Try again." });
  });

  it("is picked up after a reload at no cost when it is a talking head, and left alone when it is another video", async () => {
    ai.pending = { name: "Other", tokens: ["t1"], seconds: [5] };
    expect(resumeTalk("u1")).toBe(false);
    expect(ai.resume).not.toHaveBeenCalled();

    ai.pending = { name: "Mine", tokens: ["t1", "t2"], seconds: [9.5, 6.5], extra: { toast: TALK_TOAST } };
    ai.resume.mockImplementationOnce(() => {
      ai.set({ kind: "avatar", state: "working", step: "Making your video, 1 of 2 parts ready. This takes a few minutes." });
      void Promise.resolve().then(() => ai.set({ kind: "avatar", state: "done", step: "" }));
    });
    saveTyped("u1", { script: SCRIPT, look: "" });
    expect(resumeTalk("u1")).toBe(true);
    expect(talkJob()?.step).toBe("Making your video, 1 of 2 parts ready. This takes a few minutes.");
    await Promise.resolve();
    await Promise.resolve();
    expect(talkJob()?.state).toBe("done");
    expect(fn).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
    expect(loadTyped("u1").script).toBe("");
  });
});

// pinned before TalkAsk.draftId (plan-review-queue): a talking head started without one hands the editor exactly today's extra
describe("the editor's extra without a draftId", () => {
  it("makes the video with today's keys, straight through and after the price check", async () => {
    await startTalk("u1", ASK);
    // plus the script said (live-p5dog D8), which the editor captions from instead of transcribing
    expect(Object.keys(ai.makeAvatar.mock.calls[0][3]).sort()).toEqual(["ai", "caption", "said", "toast"]);
    ai.slice.mockResolvedValue(voiceOf(21, [9.5, 9.5, 2]));
    await startTalk("u1", ASK);
    expect(talkJob()?.state).toBe("priced");
    await goOnAtPrice("u1");
    expect(Object.keys(ai.makeAvatar.mock.calls[1][3]).sort()).toEqual(["ai", "caption", "said", "toast"]);
    expect(ai.makeAvatar.mock.calls[1][3].said).toBe(SCRIPT);
  });

  it("carries a campaign post's draftId to the editor, straight through and after the price check", async () => {
    await startTalk("u1", { ...ASK, draftId: "cmp_c-1_6" });
    expect(ai.makeAvatar.mock.calls[0][3]).toMatchObject({ draftId: "cmp_c-1_6", toast: TALK_TOAST });
    ai.slice.mockResolvedValue(voiceOf(21, [9.5, 9.5, 2]));
    await startTalk("u1", { ...ASK, draftId: "cmp_c-1_7" });
    await goOnAtPrice("u1");
    expect(ai.makeAvatar.mock.calls[1][3].draftId).toBe("cmp_c-1_7");
  });
});

describe("Write it for me", () => {
  it("puts the script in the box and on this device, and makes nothing else", async () => {
    saveTyped("u1", { script: "Why follow-ups win deals", look: "kept" });
    await writeTalk("u1", ASK);
    expect(talkJob()).toMatchObject({ state: "written", script: SCRIPT, writeOnly: true });
    expect(loadTyped("u1")).toEqual({ script: SCRIPT, look: "kept" });
    expect(ai.makePresenter).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
    // nothing is being made, so Making now has no row for it
    expect(formatJobs().find((f) => f.slug === "talking-head")).toBeUndefined();
  });
});

describe("a talking video the agent asked for (live-p6replay D6)", () => {
  it("hands the agent's chat to the presenter and the video, and keeps it on the run for the script's row", async () => {
    const agent = { thread: "t1", msg: "m1" };
    // a look no earlier test made, so this run makes its presenter rather than reusing this session's
    await startTalk("u1", { ...ASK, agent, look: "A Chinese Singaporean man in his 50s, rimless glasses" });
    expect(ai.makePresenter.mock.calls[0][2]).toEqual(agent);
    expect(ai.makeAvatar.mock.calls[0][4]).toEqual(agent);
    expect(talkJob()?.ask?.agent).toEqual(agent);
    ai.makePresenter.mockClear();
    ai.makeAvatar.mockClear();
    dropTalk();
    await startTalk("u1", ASK);
    expect(ai.makeAvatar.mock.calls[0][4]).toBeUndefined();
  });
});
