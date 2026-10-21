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
import { fixImage, imageJob, makeImage } from "./aiImage";
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
