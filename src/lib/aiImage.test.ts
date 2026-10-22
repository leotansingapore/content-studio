import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/edgeFn", () => ({ callFn: vi.fn() }));
const as = vi.hoisted(() => ({ user: null as null | { id: string; email: string } }));
vi.mock("@/lib/useLeoOnly", () => ({ leoUser: async () => as.user }));
vi.mock("@/lib/mediaLibrary", () => ({
  addMedia: vi.fn(),
  storePicture: vi.fn(async () => ({ key: "pic-1", url: "data:image/png;base64,x", width: 1080, height: 1440 })),
}));

import { callFn } from "@/lib/edgeFn";
import { addMedia, storePicture } from "@/lib/mediaLibrary";
import { fixImage, imageJob, logoBox, makeImage, onImageJob, resumeImage } from "./aiImage";
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

// The picture request for everyone else, pinned before learnings joined it (brand-voice-memory): the prompt as typed,
// whatever /voice holds for the account.
describe("the prompt sent for everyone else", () => {
  it("is the prompt as typed", async () => {
    const store = new Map<string, string>([
      ["content-studio-facts-u1", JSON.stringify([{ id: "f1", text: "12 years as an adviser", createdAt: "2026-10-20T03:00:00.000Z" }])],
      ["content-studio-learnings-u1", JSON.stringify([{ id: "l1", text: "Use Asian presenters", scope: "pictures", source: "typed", createdAt: "2026-10-20T03:00:00.000Z" }])],
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

describe("Leo's learnings in the picture prompt", () => {
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
    as.user = { id: "u1", email: "leo@example.com" };
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

  it("keeps the picture as made with the switch off or no logo", async () => {
    kit(false);
    expect(await run()).toEqual(["png", "png"]);
    vi.mocked(storePicture).mockClear();
    kit(true, "");
    expect(await run()).toEqual(["png", "png"]);
  });
});
