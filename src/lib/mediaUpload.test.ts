import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Adding files with the device faked: IndexedDB, the browser's picture and video readers, and the sort queue.
const dev = vi.hoisted(() => ({
  files: new Map<string, Blob>(),
  full: false,
  sorted: [] as string[][],
  video: { duration: 24, videoWidth: 1080, videoHeight: 1920 } as Record<string, number>,
  unreadable: false,
  photos: 0,
}));
vi.mock("@/lib/deviceFiles", () => ({
  putFile: async (k: string, b: Blob) => {
    if (dev.full) throw new DOMException("full", "QuotaExceededError");
    dev.files.set(k, b);
  },
  getFile: async (k: string) => dev.files.get(k),
  deleteFile: async (k: string) => void dev.files.delete(k),
}));
vi.mock("@/lib/videoMedia", () => ({
  loadVideo: async () => {
    if (dev.unreadable) throw new Error("This browser can't open that video. Try an MP4 or MOV.");
    return { ...dev.video, src: "blob:x" };
  },
  stills: async () => ["data:image/jpeg;base64,/9j/"],
}));
vi.mock("@/lib/mediaSort", () => ({ sortMedia: (_uid: string, keys: string[]) => void dev.sorted.push(keys) }));
vi.mock("@/lib/mediaLibrary", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/mediaLibrary")>();
  return {
    ...real,
    storePicture: async (f: Blob) => {
      if (dev.full) throw new DOMException("full", "QuotaExceededError");
      const key = `cimg-photo${String(++dev.photos).padStart(3, "0")}`;
      dev.files.set(key, f);
      return { key, url: "", width: 1080, height: 1350 };
    },
  };
});

import { addMedia, loadMedia } from "@/lib/mediaLibrary";
import { addFiles, FULL_LINE, fileLine, lengthLine, PICK_LINE, planUpload, SPACE_LINE } from "@/lib/mediaUpload";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  dev.files.clear();
  dev.full = false;
  dev.sorted.length = 0;
  dev.video = { duration: 24, videoWidth: 1080, videoHeight: 1920 };
  dev.unreadable = false;
  dev.photos = 0;
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
});
afterEach(() => vi.unstubAllGlobals());

const file = (name: string, size: number, type = "") => Object.defineProperty(new File(["x"], name, { type }), "size", { value: size }) as File;
const MB = 1_000_000;

describe("media upload checks", () => {
  it("refuses each file with its exact line", () => {
    expect(fileLine(file("clip.mp4", 64 * MB))).toBe("clip.mp4 is 64 MB. Videos can be up to 50 MB.");
    expect(fileLine(file("clip.mov", 50 * MB + 1))).toBe("clip.mov is 50.1 MB. Videos can be up to 50 MB.");
    expect(fileLine(file("me.jpg", 12.4 * MB, "image/jpeg"))).toBe("me.jpg is 12.4 MB. Photos can be up to 10 MB.");
    expect(fileLine(file("deck.pdf", MB, "application/pdf"))).toBe("deck.pdf isn't a photo or video we can use.");
    expect(fileLine(file("song.mp3", MB, "audio/mpeg"))).toBe("song.mp3 isn't a photo or video we can use.");
    expect(fileLine(file("logo.webp", 10 * MB))).toBeNull();
    expect(fileLine(file("walk.MOV", 50 * MB))).toBeNull();
    expect(lengthLine("talk.mp4", 250)).toBe("talk.mp4 runs 4:10. Videos can be up to 3 minutes.");
    expect(lengthLine("talk.mp4", 180.4)).toBeNull();
  });

  it("takes the first 20 that pass, and only as many as the library has room for", () => {
    const many = Array.from({ length: 25 }, (_, i) => file(`p${i}.jpg`, MB));
    expect(planUpload(many, 300)).toMatchObject({ lines: [PICK_LINE] });
    expect(planUpload(many, 300).take.map((f) => f.name)).toEqual(many.slice(0, 20).map((f) => f.name));
    const three = [file("a.jpg", MB), file("b.gif", MB), file("c.png", MB), file("d.mp4", MB)];
    const plan = planUpload(three, 2);
    expect(plan.take.map((f) => f.name)).toEqual(["a.jpg", "c.png"]);
    expect(plan.lines).toEqual(["b.gif isn't a photo or video we can use.", FULL_LINE]);
    expect(FULL_LINE).toBe("Media holds 300 files. Remove some to add more.");
    expect(PICK_LINE).toBe("Pick up to 20 at a time. Added the first 20.");
  });
});

describe("adding files", () => {
  it("keeps photos as today and videos as their own bytes with a still, newest first, then queues their sort", async () => {
    const progress: string[] = [];
    const r = await addFiles("u1", [file("Me.jpg", 2 * MB), file("Walk.mp4", 20 * MB)], { folder: "Office", onProgress: (n, of) => progress.push(`${n} of ${of}`) });
    expect(progress).toEqual(["1 of 2", "2 of 2"]);
    expect(r.lines).toEqual([]);
    const [video, photo] = loadMedia("u1", { videos: true });
    expect(photo).toMatchObject({ key: "cimg-photo001", kind: "photo", name: "Me", folder: "Office", width: 1080, height: 1350, bytes: 2 * MB });
    expect(video).toMatchObject({ kind: "video", name: "Walk", seconds: 24, width: 1080, height: 1920, bytes: 20 * MB });
    expect(video.key).toMatch(/^cvid-[a-z0-9]{6,30}$/);
    expect(dev.files.has(video.key) && dev.files.has(video.key.replace("cvid-", "cimg-"))).toBe(true);
    expect(dev.sorted).toEqual([r.added]);
    // photo pickers elsewhere still see the photo only
    expect(loadMedia("u1").map((m) => m.key)).toEqual(["cimg-photo001"]);
  });

  it("stores nothing for a refused file", async () => {
    dev.video = { duration: 250, videoWidth: 1080, videoHeight: 1920 };
    expect((await addFiles("u1", [file("talk.mp4", MB), file("big.jpg", 11 * MB), file("x.txt", 10)])).lines).toEqual([
      "big.jpg is 11 MB. Photos can be up to 10 MB.",
      "x.txt isn't a photo or video we can use.",
      "talk.mp4 runs 4:10. Videos can be up to 3 minutes.",
    ]);
    dev.unreadable = true;
    expect((await addFiles("u1", [file("odd.mov", MB)])).lines).toEqual(["This browser can't open that video. Try an MP4 or MOV."]);
    expect(dev.files.size).toBe(0);
    expect(loadMedia("u1", { videos: true })).toEqual([]);
    expect(dev.sorted).toEqual([[], []]);
  });

  it("refuses past 300 files before storing anything, and never drops the oldest", async () => {
    for (let i = 0; i < 299; i++) addMedia("u1", { key: `cimg-p${String(i).padStart(5, "0")}`, name: "", folder: "", alt: "", width: 1, height: 1, addedAt: "" });
    const r = await addFiles("u1", [file("a.jpg", MB), file("b.jpg", MB)]);
    expect(r.lines).toEqual([FULL_LINE]);
    expect(r.added).toEqual(["cimg-photo001"]);
    expect(dev.files.size).toBe(1);
    expect(loadMedia("u1")).toHaveLength(300);
    expect(loadMedia("u1").at(-1)!.key).toBe("cimg-p00000");
  });

  it("stops with the space line when the device is full, before or while storing", async () => {
    vi.stubGlobal("navigator", { storage: { estimate: async () => ({ usage: 990 * MB, quota: 1000 * MB }) } });
    expect(await addFiles("u1", [file("Walk.mp4", 20 * MB), file("Me.jpg", MB)])).toEqual({ added: [], lines: [SPACE_LINE] });
    expect(dev.files.size).toBe(0);
    vi.stubGlobal("navigator", { storage: { estimate: async () => ({ usage: 0, quota: 1000 * MB }) } });
    dev.full = true;
    expect(await addFiles("u1", [file("Me.jpg", MB), file("Two.jpg", MB)])).toEqual({ added: [], lines: [SPACE_LINE] });
    expect(loadMedia("u1")).toEqual([]);
  });
});
