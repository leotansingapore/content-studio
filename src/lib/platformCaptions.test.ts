import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {}, SUPABASE_ANON_KEY: "", SUPABASE_URL: "" }));
vi.mock("@/lib/edgeFn", () => ({ callFn: vi.fn(async () => ({ disconnected: 0 })) }));
vi.mock("@/lib/videoMedia", () => ({ deleteFile: () => Promise.resolve() }));

import { loadPlatformCaptions, savePlatformCaptions, writePlatformCaptions } from "./platformCaptions";
import { callFn } from "@/lib/edgeFn";
import { isSyncedKeyFor } from "./cloudSync";
import { removeProject, saveProject } from "./videoProjects";
import { addProfile, removeProfile, setActiveProfile } from "./profiles";

const ME = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const OTHER = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
const OLD = "content-studio-video-captions-v1";

let m: Map<string, string>;
const captionKeys = () => [...m.keys()].filter((k) => k.startsWith("content-studio-video-captions-"));
const project = (id: string) => ({ id, name: id, createdAt: "", updatedAt: "", duration: 60, size: 1, words: [], settings: {} as never, thumb: "" });

beforeEach(() => {
  m = new Map();
  const storage = {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
  vi.stubGlobal("window", { localStorage: storage });
  vi.stubGlobal("localStorage", storage);
});

describe("a video's captions for other platforms", () => {
  it("are kept under the signed-in account, so they never upload into the next account on this browser", () => {
    savePlatformCaptions(ME, "v1", { tiktok: "Hi" });
    expect(captionKeys()).toHaveLength(1);
    expect(isSyncedKeyFor(captionKeys()[0], ME)).toBe(true);
    expect(isSyncedKeyFor(captionKeys()[0], OTHER)).toBe(false);
    expect(loadPlatformCaptions(OTHER, "v1")).toEqual({});
    expect(loadPlatformCaptions(ME, "v1")).toEqual({ tiktok: "Hi" });
  });

  it("saved under the old key move to the account's own key when the video is opened, and the old key never syncs", () => {
    m.set(OLD, JSON.stringify({ tiktok: "Old" }));
    expect(isSyncedKeyFor(OLD, OTHER)).toBe(false);
    expect(loadPlatformCaptions(ME, "v1")).toEqual({ tiktok: "Old" });
    expect(captionKeys()).toEqual([`${OLD}-${ME}`]);
  });

  it("go with their video, and with their profile", async () => {
    saveProject(ME, project("v1"));
    savePlatformCaptions(ME, "v1", { tiktok: "a" });
    removeProject(ME, "v1");
    expect(captionKeys()).toEqual([]);

    const mb = addProfile(ME, "MoneyBees");
    setActiveProfile(ME, mb.id);
    saveProject(ME, project("v2"));
    savePlatformCaptions(ME, "v2", { tiktok: "b" });
    expect(captionKeys()).toEqual([`content-studio-video-captions-v2-${ME}~${mb.id}`]);
    await removeProfile(ME, mb.id);
    expect(captionKeys()).toEqual([]);
  });
});

describe("writing a video's captions for the brand's profession", () => {
  it("sends the profession for any other work and today's body for an adviser", async () => {
    const call = callFn as unknown as ReturnType<typeof vi.fn>;
    call.mockClear();
    call.mockResolvedValue({ captions: { tiktok: "a", linkedin: "b", facebook: "c", youtube: "d", x: "e", threads: "f" } });
    await writePlatformCaptions("what they say", "", "", "", "coach");
    await writePlatformCaptions("what they say", "", "");
    const bodies = call.mock.calls.map((c) => JSON.parse(JSON.stringify(c[1])));
    expect(bodies).toEqual([
      { mode: "captions", transcript: "what they say", instagram: "", title: "", profession: "coach" },
      { mode: "captions", transcript: "what they say", instagram: "", title: "" },
    ]);
  });
});
