import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/edgeFn", () => ({ callFn: vi.fn() }));
const as = vi.hoisted(() => ({ user: null as null | { id: string; email: string } }));
vi.mock("@/lib/useLeoOnly", () => ({ leoUser: async () => as.user }));
const drafts = vi.hoisted(() => ({ list: [] as { id: string; attached?: string[] }[] }));
vi.mock("@/lib/draftHistory", () => ({
  getDraftById: (_u: string, id: string) => drafts.list.find((d) => d.id === id) ?? null,
  loadDrafts: () => drafts.list,
  setDraftAttached: (_u: string, id: string, keys: string[]) => (drafts.list = drafts.list.map((d) => (d.id === id ? { ...d, attached: keys } : d))),
}));
vi.mock("@/lib/deviceFiles", () => ({ deleteFile: vi.fn(async () => {}), getFile: vi.fn(async () => new Blob(["kept"])) }));
vi.mock("@/lib/mediaLibrary", async (actual) => ({
  centerCrop: (await actual<typeof import("@/lib/mediaLibrary")>()).centerCrop,
  addMedia: vi.fn(),
  storePicture: vi.fn(async () => ({ key: "pic-1", url: "data:image/png;base64,x", width: 1080, height: 1440 })),
}));

import { callFn } from "@/lib/edgeFn";
import { addMedia, storePicture } from "@/lib/mediaLibrary";
import { deleteFile } from "@/lib/deviceFiles";
import { attachImageTo, autoImage, brandLine, fixImage, imageJob, logoBox, makeImage, onImageJob, resumeImage } from "./aiImage";
import { MAX_PROMPT } from "../../supabase/functions/ai-image/logic";

type Body = { mode: string };
const starts = () => vi.mocked(callFn).mock.calls.filter(([, b]) => (b as Body).mode !== "status");

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(callFn).mockReset();
  vi.mocked(addMedia).mockClear();
  vi.mocked(storePicture).mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["png"]))));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  as.user = null;
});

/** Runs a job to its end, one status poll at a time. */
const settle = async (job: Promise<void>) => {
  for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(2500);
  await job;
};

describe("Make the image", () => {
  it("keeps a picture Higgsfield made when one status check drops, and saves it to Media", async () => {
    let checks = 0;
    vi.mocked(callFn).mockImplementation(async (_fn, body) => {
      if ((body as Body).mode !== "status") return { token: "t1" };
      if (++checks === 1) throw new Error("Couldn't reach the server.");
      return { state: "done", url: "https://cdn.higgsfield.ai/pic.png" };
    });
    await settle(makeImage("u1", "A family picnic at East Coast Park", "Picnic"));
    expect(imageJob()).toMatchObject({ state: "done", mediaKey: "pic-1", token: "t1" });
    expect(addMedia).toHaveBeenCalledWith("u1", expect.objectContaining({ key: "pic-1", folder: "AI images" }));
  });

  it("keeps the picture the adviser already had when a fix fails", async () => {
    vi.mocked(callFn).mockImplementation(async (_fn, body) =>
      (body as Body).mode === "status" ? { state: "done", url: "https://cdn.higgsfield.ai/pic.png" } : { token: "t1" });
    await settle(makeImage("u1", "A family picnic at East Coast Park", "Picnic"));
    vi.mocked(callFn).mockRejectedValueOnce(new Error("You've used all 5 for today. It resets at 8am Singapore time."));
    await settle(fixImage("u1", "make the sky bluer"));
    expect(imageJob()).toMatchObject({
      state: "done",
      mediaKey: "pic-1",
      token: "t1",
      fixError: "You've used all 5 for today. It resets at 8am Singapore time.",
    });
  });

  it("never starts a second paid picture while one is still being made", async () => {
    let finish: (v: unknown) => void = () => {};
    vi.mocked(callFn).mockImplementation((_fn, body) =>
      (body as Body).mode === "status" ? Promise.resolve({ state: "done", url: "https://cdn.higgsfield.ai/pic.png" }) : new Promise((r) => (finish = r)));
    const first = makeImage("u1", "A family picnic at East Coast Park", "Picnic");
    await makeImage("u1", "A hawker centre at lunchtime", "Hawker");
    expect(starts()).toHaveLength(1);
    finish({ token: "t1" });
    await settle(first);
    expect(imageJob()).toMatchObject({ state: "done", prompt: "A family picnic at East Coast Park" });
  });
});

// The picture request with nothing for pictures saved, pinned before learnings joined it (brand-voice-memory): the
// prompt as typed, whatever else /voice and /coach hold for the account.
describe("a picture Write makes on its own for a post", () => {
  const done = async (_fn: string, body: unknown) => ((body as Body).mode === "status" ? { state: "done", url: "https://db/sign/cs-ai-images/u1/a.jpg" } : { token: "t1" });
  const keys = (...k: string[]) => k.forEach((key) => vi.mocked(storePicture).mockResolvedValueOnce({ key, url: "data:image/jpeg;base64,x", width: 1152, height: 1536 }));

  it("goes on the post as its own copy when nothing is attached, and into AI images", async () => {
    drafts.list = [{ id: "d1" }];
    vi.mocked(callFn).mockImplementation(done);
    keys("pic-1", "pic-2");
    await settle(autoImage("u1", "A family picnic at East Coast Park", "Picnic", "d1"));
    expect(addMedia).toHaveBeenCalledWith("u1", expect.objectContaining({ key: "pic-1", folder: "AI images" }));
    expect(drafts.list).toEqual([{ id: "d1", attached: ["pic-2"] }]);
    expect(imageJob()).toMatchObject({ state: "done", mediaKey: "pic-1", attached: { draft: "d1", key: "pic-2" } });
  });

  it("swaps the post's picture for the fixed one and drops the old copy", async () => {
    drafts.list = [{ id: "d1" }];
    vi.mocked(callFn).mockImplementation(done);
    keys("pic-1", "pic-2", "pic-3", "pic-4");
    await settle(autoImage("u1", "A family picnic at East Coast Park", "Picnic", "d1"));
    await settle(fixImage("u1", "make the sky bluer"));
    expect(drafts.list).toEqual([{ id: "d1", attached: ["pic-4"] }]);
    expect(deleteFile).toHaveBeenCalledWith("pic-2");
    expect(imageJob()).toMatchObject({ state: "done", mediaKey: "pic-3", attached: { draft: "d1", key: "pic-4" } });
  });

  it("leaves the post alone when the adviser attached something while it was made", async () => {
    drafts.list = [{ id: "d1", attached: ["mine"] }];
    vi.mocked(callFn).mockImplementation(done);
    keys("pic-1");
    await settle(autoImage("u1", "A family picnic at East Coast Park", "Picnic", "d1"));
    expect(drafts.list).toEqual([{ id: "d1", attached: ["mine"] }]);
    expect(imageJob()?.attached).toBeUndefined();
    expect(storePicture).toHaveBeenCalledTimes(1);
  });

  it("only goes to AI images when no post is named", async () => {
    drafts.list = [{ id: "d1" }];
    vi.mocked(callFn).mockImplementation(done);
    await settle(autoImage("u1", "A family picnic at East Coast Park", "Picnic"));
    expect(drafts.list).toEqual([{ id: "d1" }]);
    expect(imageJob()?.attached).toBeUndefined();
  });
});

describe("a picture made while the post is still being written", () => {
  const done = async (_fn: string, body: unknown) => ((body as Body).mode === "status" ? { state: "done", url: "https://db/sign/cs-ai-images/u1/a.jpg" } : { token: "t1" });
  const keys = (...k: string[]) => k.forEach((key) => vi.mocked(storePicture).mockResolvedValueOnce({ key, url: "data:image/jpeg;base64,x", width: 1152, height: 1536 }));

  it("goes on the post picked while it was being made, when it lands", async () => {
    drafts.list = [{ id: "d1" }];
    vi.mocked(callFn).mockImplementation(done);
    keys("pic-1", "pic-2");
    const making = autoImage("u1", "A laptop on a desk", "Portfolio");
    await attachImageTo("u1", "d1", "A laptop on a desk");
    await settle(making);
    expect(drafts.list).toEqual([{ id: "d1", attached: ["pic-2"] }]);
    expect(imageJob()).toMatchObject({ state: "done", mediaKey: "pic-1", attached: { draft: "d1", key: "pic-2" } });
  });

  it("goes on a post picked after it landed, as its own copy of the Media picture", async () => {
    drafts.list = [{ id: "d1" }, { id: "d2" }];
    vi.mocked(callFn).mockImplementation(done);
    keys("pic-1", "pic-2", "pic-3");
    await settle(autoImage("u1", "A laptop on a desk", "Portfolio"));
    await attachImageTo("u1", "d1", "A laptop on a desk");
    await attachImageTo("u1", "d2", "A laptop on a desk");
    expect(drafts.list).toEqual([{ id: "d1", attached: ["pic-2"] }, { id: "d2", attached: ["pic-3"] }]);
    expect(imageJob()?.attached).toEqual({ draft: "d2", key: "pic-3" });
  });

  it("leaves the post alone for a picture from another prompt, or when it already has one", async () => {
    drafts.list = [{ id: "d1" }, { id: "d2", attached: ["mine"] }];
    vi.mocked(callFn).mockImplementation(done);
    keys("pic-1");
    await settle(autoImage("u1", "A laptop on a desk", "Portfolio"));
    await attachImageTo("u1", "d1", "A hawker centre at lunchtime");
    await attachImageTo("u1", "d2", "A laptop on a desk");
    expect(drafts.list).toEqual([{ id: "d1" }, { id: "d2", attached: ["mine"] }]);
  });

  it("forgets a post picked for the last picture when the next one starts", async () => {
    drafts.list = [{ id: "d1" }];
    vi.mocked(callFn).mockImplementation(done);
    keys("pic-1", "pic-2", "pic-3");
    const first = autoImage("u1", "A laptop on a desk", "Portfolio");
    await attachImageTo("u1", "d1", "A laptop on a desk");
    await settle(first);
    drafts.list = [{ id: "d1" }];
    await settle(autoImage("u1", "A hawker centre at lunchtime", "Hawker"));
    expect(drafts.list).toEqual([{ id: "d1" }]);
  });
});

describe("the brand's colours on a post's own picture", () => {
  it("names the kit colour and its palette once each, and nothing without a kit", () => {
    expect(brandLine({ color: "#1e3a8a", palette: [{ hex: "#F59E0B" }, { hex: "#1E3A8A" }, { hex: "red" }] })).toBe(
      "Where it suits the scene, use the brand's colours as accents: #1E3A8A, #F59E0B.",
    );
    expect(brandLine(null)).toBe("");
    expect(brandLine({ color: "" })).toBe("");
  });

  it("goes after Write's picture prompt, and Make the image elsewhere sends the prompt as typed", async () => {
    const store = new Map<string, string>([["content-studio-carousel-brand-u1", JSON.stringify({ color: "#0F766E", name: "Ada", handle: "@ada" })]]);
    const localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("window", { localStorage, location: { search: "" } });
    vi.mocked(callFn).mockImplementation(async (_fn, body) =>
      (body as Body).mode === "status" ? { state: "done", url: "https://cdn.higgsfield.ai/pic.png" } : { token: "t1" });
    await settle(autoImage("u1", "A laptop on a desk", "Portfolio"));
    await settle(makeImage("u1", "A laptop on a desk", "Portfolio"));
    expect(starts().map(([, b]) => (b as { prompt: string }).prompt)).toEqual([
      "A laptop on a desk\n\nWhere it suits the scene, use the brand's colours as accents: #0F766E.",
      "A laptop on a desk",
    ]);
    expect(imageJob()?.prompt).toBe("A laptop on a desk");
  });
});

describe("the prompt sent for everyone else", () => {
  it("is the prompt as typed", async () => {
    const store = new Map<string, string>([
      ["content-studio-coachprofile-u1", JSON.stringify({ likes: ["client stories"], dislikes: ["jargon"] })],
      ["content-studio-learnings-u1", JSON.stringify([{ id: "l1", text: "Never use emoji", scope: "posts", source: "typed", createdAt: "2026-10-20T03:00:00.000Z" }])],
    ]);
    const localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("window", { localStorage, location: { search: "" } });
    vi.mocked(callFn).mockImplementation(async (_fn, body) =>
      (body as Body).mode === "status" ? { state: "done", url: "https://cdn.higgsfield.ai/pic.png" } : { token: "t1" });
    await settle(makeImage("u1", "A family picnic at East Coast Park", "Picnic"));
    expect(JSON.stringify(starts().map(([fn, body]) => [fn, body]))).toBe('[["ai-image",{"mode":"start","prompt":"A family picnic at East Coast Park"}]]');
  });
});

// A make and a fix for everyone else, pinned before a reload could pick a make up again (D4, 22 Oct live check): the
// calls, what the page is told at each step and what lands in Media.
describe("a make and a fix for everyone else, pinned", () => {
  it("asks, polls, saves to AI images and says so, the same way", async () => {
    let polls = 0;
    vi.mocked(callFn).mockImplementation(async (_fn, body) => {
      const b = body as { mode: string; token?: string };
      if (b.mode === "start") return { token: "t1", usage: { used: 1, limit: 3 } };
      if (b.mode === "fix") return { token: "t2", usage: { used: 2, limit: 3 } };
      return ++polls === 1 ? { state: "working" } : { state: "done", url: `https://cdn.higgsfield.ai/${b.token}.png` };
    });
    const seen: unknown[] = [];
    const off = onImageJob((j) => seen.push(j));
    await settle(makeImage("u1", "A family picnic at East Coast Park", "Picnic at East Coast Park"));
    await settle(fixImage("u1", "make the sky bluer"));
    off();
    expect(vi.mocked(callFn).mock.calls).toEqual([
      ["ai-image", { mode: "start", prompt: "A family picnic at East Coast Park" }, "Couldn't make the image right now. Try again in a minute."],
      ["ai-image", { mode: "status", token: "t1" }],
      ["ai-image", { mode: "status", token: "t1" }],
      ["ai-image", { mode: "fix", token: "t1", fix: "make the sky bluer" }, "Couldn't make the image right now. Try again in a minute."],
      ["ai-image", { mode: "status", token: "t2" }],
    ]);
    expect(vi.mocked(fetch).mock.calls.map(([u]) => u)).toEqual(["https://cdn.higgsfield.ai/t1.png", "https://cdn.higgsfield.ai/t2.png"]);
    const done = { prompt: "A family picnic at East Coast Park", state: "done", mediaKey: "pic-1", preview: "data:image/png;base64,x", name: "Picnic at East Coast Park" };
    expect(seen).toEqual([
      { prompt: "A family picnic at East Coast Park", state: "working", fix: undefined },
      { prompt: "A family picnic at East Coast Park", state: "saving", fix: undefined },
      { ...done, token: "t1" },
      { prompt: "A family picnic at East Coast Park", state: "working", fix: "make the sky bluer" },
      { prompt: "A family picnic at East Coast Park", state: "saving", fix: "make the sky bluer" },
      { ...done, token: "t2" },
    ]);
    expect(vi.mocked(addMedia).mock.calls.map(([u, m]) => [u, { ...m, addedAt: typeof m.addedAt }])).toEqual([
      ["u1", { key: "pic-1", name: "Picnic at East Coast Park", folder: "AI images", alt: "A family picnic at East Coast Park", width: 1080, height: 1440, addedAt: "string" }],
      ["u1", { key: "pic-1", name: "Picnic at East Coast Park (fixed)", folder: "AI images", alt: "A family picnic at East Coast Park Fixed: make the sky bluer", width: 1080, height: 1440, addedAt: "string" }],
    ]);
    // kept as made, nothing cut off
    expect(vi.mocked(storePicture).mock.calls.map(([, , ratio]) => ratio)).toEqual([undefined, undefined]);
  });

  it("says why when Higgsfield fails, and keeps nothing", async () => {
    vi.mocked(callFn).mockImplementation(async (_fn, body) => ((body as Body).mode === "status" ? { state: "failed", error: "The image couldn't be made. Try a different prompt." } : { token: "t1" }));
    await settle(makeImage("u1", "A family picnic at East Coast Park", "Picnic"));
    expect(imageJob()).toEqual({ prompt: "A family picnic at East Coast Park", state: "failed", error: "The image couldn't be made. Try a different prompt." });
    expect(addMedia).not.toHaveBeenCalled();
  });
});

describe("a reload while a picture is made (D4)", () => {
  const KEY = "cs-ai-image-making-u1";
  const store = new Map<string, string>();
  const done = { state: "done", url: "https://cdn.higgsfield.ai/t9.png" };
  beforeEach(() => {
    store.clear();
    const localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("window", { localStorage, location: { search: "" } });
  });

  it("keeps the paid token on this device until the picture is in Media", async () => {
    let waiting: unknown = null;
    vi.mocked(callFn).mockImplementation(async (_fn, body) => {
      if ((body as Body).mode !== "status") return { token: "t1" };
      waiting = JSON.parse(store.get(KEY) ?? "null");
      return done;
    });
    await settle(makeImage("u1", "A sales rep checking her follow-ups on her phone", "Follow-ups", "img-1"));
    expect(waiting).toEqual({ prompt: "A sales rep checking her follow-ups on her phone", name: "Follow-ups", designId: "img-1", token: "t1" });
    expect(store.has(KEY)).toBe(false);
    expect(imageJob()).toMatchObject({ state: "done", designId: "img-1" });
  });

  it("picks the picture up after a reload at no cost, keeps it in AI images and leaves nothing to pick up", async () => {
    store.set(KEY, JSON.stringify({ token: "t9", prompt: "A sales rep checking her follow-ups on her phone", name: "Follow-ups", designId: "img-1" }));
    vi.mocked(callFn).mockImplementation(async (_fn, body) => ((body as Body).mode === "status" ? done : { token: "never" }));
    resumeImage("u1");
    expect(imageJob()).toMatchObject({ state: "working", prompt: "A sales rep checking her follow-ups on her phone", designId: "img-1" });
    await settle(Promise.resolve());
    expect(starts()).toHaveLength(0);
    expect(vi.mocked(callFn).mock.calls[0]).toEqual(["ai-image", { mode: "status", token: "t9" }]);
    expect(addMedia).toHaveBeenCalledWith("u1", expect.objectContaining({ key: "pic-1", name: "Follow-ups", folder: "AI images" }));
    expect(imageJob()).toMatchObject({ state: "done", token: "t9", mediaKey: "pic-1", designId: "img-1" });
    expect(store.has(KEY)).toBe(false);
    vi.mocked(callFn).mockClear();
    resumeImage("u1");
    await settle(Promise.resolve());
    expect(callFn).not.toHaveBeenCalled();
  });

  it("drops the token when the picture fails, and never picks one up while another is being made", async () => {
    store.set(KEY, JSON.stringify({ token: "t9", prompt: "A sales rep", name: "Rep" }));
    vi.mocked(callFn).mockImplementation(async () => ({ state: "failed", error: "That image job isn't known." }));
    resumeImage("u1");
    await settle(Promise.resolve());
    expect(imageJob()).toEqual({ prompt: "A sales rep", state: "failed", error: "That image job isn't known." });
    expect(store.has(KEY)).toBe(false);

    let start: (v: unknown) => void = () => {};
    vi.mocked(callFn).mockImplementation((_fn, body) => ((body as Body).mode === "status" ? Promise.resolve(done) : new Promise((r) => (start = r))));
    const making = makeImage("u1", "A hawker centre at lunchtime", "Hawker");
    await vi.advanceTimersByTimeAsync(0);
    store.set(KEY, JSON.stringify({ token: "t8", prompt: "Another", name: "Another" }));
    resumeImage("u1");
    expect(imageJob()).toMatchObject({ prompt: "A hawker centre at lunchtime" });
    start({ token: "t1" });
    await settle(making);
    expect(vi.mocked(callFn).mock.calls.filter(([, b]) => (b as { token?: string }).token === "t8")).toHaveLength(0);
  });
});

describe("a photo ad: words on it, kept 4:5", () => {
  const KEY = "cs-ai-image-making-u1";
  const store = new Map<string, string>();
  const done = { state: "done", url: "https://db/storage/v1/object/sign/cs-ai-images/u1/p.jpg" };
  const shapes = () => vi.mocked(storePicture).mock.calls.map(([, , ratio]) => ratio);
  beforeEach(() => {
    store.clear();
    const localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("window", { localStorage, location: { search: "" } });
  });

  it("asks for the words, keeps the shape on this device until it lands, and cuts the made and the fixed picture to it", async () => {
    let waiting: unknown = null;
    vi.mocked(callFn).mockImplementation(async (_fn, body) => {
      const b = body as Body;
      if (b.mode === "start") return { token: "t1" };
      if (b.mode === "fix") return { token: "t2" };
      waiting ??= JSON.parse(store.get(KEY) ?? "null");
      return done;
    });
    await settle(makeImage("u1", "A poster at a bus shelter", "Poster", undefined, undefined, { words: true, ratio: 0.8 }));
    expect(starts()[0][1]).toEqual({ mode: "start", prompt: "A poster at a bus shelter", words: true });
    expect(waiting).toEqual({ prompt: "A poster at a bus shelter", name: "Poster", ratio: 0.8, token: "t1" });
    expect(imageJob()).toMatchObject({ state: "done", ratio: 0.8 });
    await settle(fixImage("u1", "make the sky bluer"));
    expect(shapes()).toEqual([0.8, 0.8]);
  });

  it("cuts a picture picked up after a reload to its shape, and ignores a shape that isn't one", async () => {
    vi.mocked(callFn).mockImplementation(async () => done);
    store.set(KEY, JSON.stringify({ token: "t9", prompt: "A poster", name: "Poster", ratio: 0.8 }));
    resumeImage("u1");
    await settle(Promise.resolve());
    store.set(KEY, JSON.stringify({ token: "t8", prompt: "A poster", name: "Poster", ratio: "wide" }));
    resumeImage("u1");
    await settle(Promise.resolve());
    expect(shapes()).toEqual([0.8, undefined]);
  });
});

describe("a picture the agent asked for (live-p6replay D6)", () => {
  const store = new Map<string, string>();
  const done = { state: "done", url: "https://cdn.higgsfield.ai/t9.png" };
  beforeEach(() => {
    store.clear();
    const localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("window", { localStorage, location: { search: "" } });
  });

  it("carries the agent's chat on every state and through a reload, and the next make without one carries none", async () => {
    const agent = { thread: "t1", msg: "m1" };
    let kept: unknown = null;
    vi.mocked(callFn).mockImplementation(async (_fn, body) => {
      if ((body as Body).mode !== "status") return { token: "t1" };
      kept = JSON.parse(store.get("cs-ai-image-making-u1") ?? "null");
      return done;
    });
    const seen: unknown[] = [];
    const off = onImageJob((j) => seen.push(j?.agent));
    await settle(makeImage("u1", "A phone on a cafe table", "Cafe", undefined, agent));
    expect(seen).toEqual([agent, agent, agent]);
    expect(kept).toMatchObject({ agent });
    store.set("cs-ai-image-making-u1", JSON.stringify({ token: "t9", prompt: "A phone", name: "Cafe", agent }));
    resumeImage("u1");
    await settle(Promise.resolve());
    expect(imageJob()).toMatchObject({ state: "done", agent });
    seen.length = 0;
    await settle(makeImage("u1", "A hawker centre", "Hawker"));
    off();
    expect(seen).toEqual([undefined, undefined, undefined]);
  });
});

// On for every sign-in from 1 Nov 2026: the default user here is not Leo.
describe("the learnings in the picture prompt", () => {
  const store = new Map<string, string>();
  const learn = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `l${i}`, text: `Picture learning number ${i}`, scope: i % 2 ? "pictures" : "all", source: "typed", createdAt: `2026-10-${10 + i}T03:00:00.000Z` }));
  beforeEach(() => {
    store.clear();
    store.set("content-studio-learnings-u1", JSON.stringify([...learn(3), { id: "lp", text: "Never use emoji", scope: "posts", source: "typed", createdAt: "2026-10-20T03:00:00.000Z" }]));
    const localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("window", { localStorage, location: { search: "" } });
    vi.mocked(callFn).mockImplementation(async (_fn, body) =>
      (body as Body).mode === "status" ? { state: "done", url: "https://cdn.higgsfield.ai/pic.png" } : { token: "t1" });
  });
  const sent = () => String((starts()[0][1] as { prompt: string }).prompt);

  it("go after the prompt, picture and everything learnings only, newest first, and the job keeps the prompt as typed", async () => {
    await settle(makeImage("u1", "A family picnic at East Coast Park", "Picnic"));
    expect(sent()).toBe(
      "A family picnic at East Coast Park\n\nABOUT ME, FROM WHAT I HAVE TOLD YOU (follow these unless MY BRAND RULES say otherwise):\n- Keep doing or avoid: Picture learning number 2; Picture learning number 1; Picture learning number 0",
    );
    expect(imageJob()).toMatchObject({ state: "done", prompt: "A family picnic at East Coast Park" });
    expect(addMedia).toHaveBeenCalledWith("u1", expect.objectContaining({ alt: "A family picnic at East Coast Park" }));
  });

  it("stay under MAX_PROMPT by leaving out the oldest learnings, and out entirely when none fits", async () => {
    const long = "A family picnic at East Coast Park, ".repeat(29).trim();
    await settle(makeImage("u1", long, "Picnic"));
    expect(sent().length).toBeLessThanOrEqual(MAX_PROMPT);
    expect(sent()).toContain("Picture learning number 2");
    expect(sent()).not.toContain("Picture learning number 0");
    vi.mocked(callFn).mockClear();
    const full = "x".repeat(MAX_PROMPT - 20);
    await settle(makeImage("u1", full, "Picnic"));
    expect(sent()).toBe(full);
  });
});

// Pinned before the brand kit's "Logo on AI pictures" (brand-kit): everyone else's picture goes to Media byte for byte
// as Higgsfield made it, whatever their kit holds.
describe("the picture kept for everyone else", () => {
  it("is the downloaded file as it came", async () => {
    const LOGO = "data:image/png;base64,iVBORw0KGgo=";
    const store = new Map<string, string>([["content-studio-carousel-brand-u1", JSON.stringify({ color: "#1E3A8A", name: "Ada", handle: "@ada", logo: LOGO, stamp: { pictureLogo: true } })]]);
    const localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("window", { localStorage, location: { search: "" } });
    // a browser that could stamp it
    vi.stubGlobal("createImageBitmap", async () => ({ width: 1080, height: 1440 }));
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ drawImage: () => {} }), toBlob: (cb: (b: Blob) => void) => cb(new Blob(["stamped"])) }) });
    vi.mocked(callFn).mockImplementation(async (_fn, body) =>
      (body as Body).mode === "status" ? { state: "done", url: "https://cdn.higgsfield.ai/pic.png" } : { token: "t1" });
    await settle(makeImage("u1", "A family picnic at East Coast Park", "Picnic"));
    vi.mocked(callFn).mockImplementation(async (_fn, body) =>
      (body as Body).mode === "status" ? { state: "done", url: "https://cdn.higgsfield.ai/fixed.png" } : { token: "t2" });
    await settle(fixImage("u1", "make the sky bluer"));
    const kept = vi.mocked(storePicture).mock.calls.map(([b]) => b as Blob);
    expect(kept).toHaveLength(2);
    for (const b of kept) expect(await b.text()).toBe("png");
  });
});

describe("Logo on AI pictures (brand-kit)", () => {
  const LOGO = "data:image/png;base64,iVBORw0KGgo=";
  const store = new Map<string, string>();
  const drawn: unknown[][] = [];
  const kit = (pictureLogo: boolean, logo: string | undefined = LOGO) =>
    store.set("content-studio-carousel-brand-u1", JSON.stringify({ color: "#1E3A8A", name: "Ada", handle: "@ada", ...(logo ? { logo } : {}), stamp: { pictureLogo } }));
  beforeEach(() => {
    store.clear();
    drawn.length = 0;
    const localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("window", { localStorage, location: { search: "" } });
    vi.stubGlobal("createImageBitmap", async () => ({ width: 1080, height: 1440 }));
    vi.stubGlobal("document", {
      createElement: () => ({ getContext: () => ({ drawImage: (...a: unknown[]) => drawn.push(a) }), toBlob: (cb: (b: Blob) => void) => cb(new Blob(["stamped"])) }),
    });
    as.user = { id: "u1", email: "leo@example.com" };
  });
  const run = async () => {
    vi.mocked(callFn).mockImplementation(async (_fn, body) =>
      (body as Body).mode === "status" ? { state: "done", url: "https://cdn.higgsfield.ai/pic.png" } : { token: "t1" });
    await settle(makeImage("u1", "A family picnic at East Coast Park", "Picnic"));
    await settle(fixImage("u1", "make the sky bluer"));
    return Promise.all(vi.mocked(storePicture).mock.calls.map(([b]) => (b as Blob).text()));
  };

  it("puts the logo bottom right at 12% of the width", () => {
    expect(logoBox(1000, 1500, 400, 200)).toEqual({ x: 850, y: 1410, width: 120, height: 60 });
  });

  it("stamps the made picture and the fixed one when the switch is on", async () => {
    kit(true);
    expect(await run()).toEqual(["stamped", "stamped"]);
    expect(drawn[1]).toEqual([{ width: 1080, height: 1440 }, ...Object.values(logoBox(1080, 1440, 1080, 1440))]);
  });

  it("keeps a photo ad's logo inside the 4:5 part it keeps, clear of the cut", async () => {
    // GPT Image's 1152x1536 cut to 1152x1440 loses 48 px top and bottom
    const box = logoBox(1152, 1536, 400, 200, 0.8);
    expect(box).toEqual({ x: 979, y: 1384, width: 138, height: 69 });
    expect(box.y + box.height).toBeLessThanOrEqual(48 + 1440);
    kit(true);
    vi.mocked(callFn).mockImplementation(async (_fn, body) =>
      (body as Body).mode === "status" ? { state: "done", url: "https://cdn.higgsfield.ai/pic.png" } : { token: "t1" });
    await settle(makeImage("u1", "A poster at a bus shelter", "Poster", undefined, undefined, { words: true, ratio: 0.8 }));
    expect(drawn[1]).toEqual([{ width: 1080, height: 1440 }, ...Object.values(logoBox(1080, 1440, 1080, 1440, 0.8))]);
  });

  it("never stamps a photo ad, or its fix, whose logo the model was given to place itself, and sends the logo once", async () => {
    kit(true);
    let kept: unknown = null;
    vi.mocked(callFn).mockImplementation(async (_fn, body) => {
      if ((body as Body).mode !== "status") return { token: "t1" };
      kept ??= JSON.parse(store.get("cs-ai-image-making-u1") ?? "null");
      return { state: "done", url: "https://cdn.higgsfield.ai/pic.png" };
    });
    await settle(makeImage("u1", "A poster at a bus shelter", "Poster", undefined, undefined, { words: true, ratio: 0.8, refs: { logo: LOGO } }));
    await settle(fixImage("u1", "make the sky bluer"));
    expect(starts().map(([, b]) => b)).toEqual([
      { mode: "start", prompt: "A poster at a bus shelter", words: true, refs: { logo: LOGO } },
      { mode: "fix", token: "t1", fix: "make the sky bluer" },
    ]);
    // the logo never sits in this device's pending token
    expect(kept).toEqual({ prompt: "A poster at a bus shelter", name: "Poster", ratio: 0.8, bare: true, token: "t1" });
    expect(await Promise.all(vi.mocked(storePicture).mock.calls.map(([b]) => (b as Blob).text()))).toEqual(["png", "png"]);
    expect(drawn).toEqual([]);
  });

  it("keeps the picture as made with the switch off or no logo", async () => {
    kit(false);
    expect(await run()).toEqual(["png", "png"]);
    vi.mocked(storePicture).mockClear();
    kit(true, "");
    expect(await run()).toEqual(["png", "png"]);
  });
});

// Every caller before the photo ad's reference pictures: the start and fix bodies sent to ai-image, and the paid token
// kept on this device, byte for byte.
describe("existing callers, pinned", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    const localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("window", { localStorage, location: { search: "" } });
  });

  it("send the same start and fix bodies and keep the same token", async () => {
    const kept: string[] = [];
    vi.mocked(callFn).mockImplementation(async (_fn, body) => {
      if ((body as Body).mode !== "status") return { token: "t1" };
      kept.push(store.get("cs-ai-image-making-u1") ?? "");
      return { state: "done", url: "https://cdn.higgsfield.ai/pic.png" };
    });
    await settle(makeImage("u1", "A family picnic at East Coast Park", "Picnic", "img-1", { thread: "th1", msg: "m1" }));
    await settle(fixImage("u1", "make the sky bluer"));
    await settle(makeImage("u1", "A poster at a bus shelter", "Poster", undefined, undefined, { words: true, ratio: 0.8 }));
    await settle(autoImage("u1", "A laptop on a desk", "Portfolio", "d1"));
    expect(JSON.stringify(starts().map(([fn, b]) => [fn, b]))).toBe(
      '[["ai-image",{"mode":"start","prompt":"A family picnic at East Coast Park"}],["ai-image",{"mode":"fix","token":"t1","fix":"make the sky bluer"}],["ai-image",{"mode":"start","prompt":"A poster at a bus shelter","words":true}],["ai-image",{"mode":"start","prompt":"A laptop on a desk"}]]',
    );
    expect([...new Set(kept)]).toEqual([
      '{"prompt":"A family picnic at East Coast Park","name":"Picnic","designId":"img-1","agent":{"thread":"th1","msg":"m1"},"token":"t1"}',
      '{"prompt":"A family picnic at East Coast Park","name":"Picnic","fix":"make the sky bluer","token":"t1"}',
      '{"prompt":"A poster at a bus shelter","name":"Poster","ratio":0.8,"token":"t1"}',
      '{"prompt":"A laptop on a desk","name":"Portfolio","attachTo":"d1","token":"t1"}',
    ]);
  });
});
