import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/edgeFn", () => ({ callFn: vi.fn() }));
vi.mock("@/lib/mediaLibrary", () => ({
  addMedia: vi.fn(),
  storePicture: vi.fn(async () => ({ key: "pic-1", url: "data:image/png;base64,x", width: 1080, height: 1440 })),
}));

import { callFn } from "@/lib/edgeFn";
import { addMedia, storePicture } from "@/lib/mediaLibrary";
import { fixImage, imageJob, makeImage } from "./aiImage";

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
