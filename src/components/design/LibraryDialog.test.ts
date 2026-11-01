import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
import type { ImageJob } from "@/lib/aiImage";
import { asPngOrJpeg, makeSet, oneLibrary } from "./LibraryDialog";

describe("a library dialog's library", () => {
  it("is made once, however many adds ask for it, together or one after another", async () => {
    const make = vi.fn(async () => ({ id: "lib1", name: "Golf" }));
    const ensure = oneLibrary(null, make);
    const [a, b] = await Promise.all([ensure(), ensure()]);
    const c = await ensure(); // the AI picture finishing after photos were added
    expect([a.id, b.id, c.id]).toEqual(["lib1", "lib1", "lib1"]);
    expect(make).toHaveBeenCalledTimes(1);
  });
  it("is never made again for a library the dialog opened with", async () => {
    const make = vi.fn(async () => ({ id: "other", name: "x" }));
    expect((await oneLibrary({ id: "lib1", name: "Golf" }, make)()).id).toBe("lib1");
    expect(make).not.toHaveBeenCalled();
  });
  it("tries again after a failed make", async () => {
    const make = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ id: "lib1", name: "Golf" });
    const ensure = oneLibrary(null, make);
    await expect(ensure()).rejects.toThrow("offline");
    expect((await ensure()).id).toBe("lib1");
  });
});

describe("library uploads", () => {
  it("send PNG and JPEG as they are (the drawer reads both)", async () => {
    for (const type of ["image/png", "image/jpeg"]) {
      const b = new Blob([new Uint8Array([1, 2, 3])], { type });
      expect(await asPngOrJpeg(b)).toBe(b);
    }
  });
});

describe("Generate a set", () => {
  const done = (n: number): ImageJob => ({ prompt: "golf", state: "done", preview: `data:${n}` });
  const kept: string[] = [];
  const keep = async (j: ImageJob) => void kept.push(j.preview!);

  it("makes each picture after the one before it and keeps each as it lands", async () => {
    kept.length = 0;
    const order: string[] = [];
    const make = vi.fn(async (n: number) => (order.push(`make ${n}, kept ${kept.length}`), done(n)));
    expect(await makeSet(3, 5, make, keep)).toBeNull();
    expect(order).toEqual(["make 1, kept 0", "make 2, kept 1", "make 3, kept 2"]);
    expect(kept).toEqual(["data:1", "data:2", "data:3"]);
  });
  it("stops when today's pictures run out, saying how many it made", async () => {
    kept.length = 0;
    const make = vi.fn(async (n: number) => done(n));
    expect(await makeSet(3, 2, make, keep)).toBe("Made 2 of 3. That's all your AI pictures for today. They reset at 8am Singapore time.");
    expect(make).toHaveBeenCalledTimes(2);
    expect(kept).toHaveLength(2);
  });
  it("stops at the first failure with its reason, and makes nothing after it", async () => {
    kept.length = 0;
    const make = vi.fn(async (n: number): Promise<ImageJob> => (n === 2 ? { prompt: "golf", state: "failed", error: "You've used all 5 for today." } : done(n)));
    expect(await makeSet(3, null, make, keep)).toBe("Made 1 of 3. You've used all 5 for today.");
    expect(make).toHaveBeenCalledTimes(2);
    expect(kept).toEqual(["data:1"]);
  });
  it("stops quietly when the dialog closes, and one picture fails as before", async () => {
    kept.length = 0;
    const make = vi.fn(async (n: number) => (n === 1 ? done(1) : null));
    expect(await makeSet(3, null, make, keep)).toBeNull();
    expect(make).toHaveBeenCalledTimes(2);
    expect(await makeSet(1, 5, async () => ({ prompt: "golf", state: "failed" }), keep)).toBe("Couldn't make the picture.");
  });
});
