import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiOf, loadFixes, loadProjects, removeProject, saveFixes, saveProject, swapSource, transcribe, type AiMark } from "./videoProjects";
import { addProfile, setActiveProfile } from "@/lib/profiles";

const deleted: string[] = [];
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } }, SUPABASE_ANON_KEY: "", SUPABASE_URL: "" }));
vi.mock("@/lib/edgeFn", () => ({ callFn: vi.fn() }));
const put: string[] = [];
vi.mock("@/lib/videoMedia", () => ({
  deleteFile: (k: string) => (deleted.push(k), Promise.resolve()),
  putFile: (k: string) => (put.push(k), Promise.resolve()),
  stills: async () => ["data:new-thumb"],
}));
let clipLength = 8;
vi.mock("@/lib/longAudio", () => ({ mediaLength: async () => clipLength }));

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

describe("saveProject", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    deleted.length = 0;
  });
  const project = (id: string, fileId?: string) => ({ id, name: id, createdAt: "", updatedAt: "", duration: 60, size: 1, words: [], settings: {} as never, thumb: "", ...(fileId ? { fileId } : {}) });

  it("keeps up to 40 clips cut from an upload apart from the 12 latest uploads, and drops a file only when nothing uses it", async () => {
    saveProject("u", project("pod"));
    for (let i = 0; i < 32; i++) saveProject("u", project(`clip${i}`, "pod"));
    expect(loadProjects("u")).toHaveLength(33);
    expect(loadProjects("u").some((p) => p.id === "pod")).toBe(true);
    for (let i = 0; i < 12; i++) saveProject("u", project(`up${i}`));
    const all = loadProjects("u");
    // the podcast is the 13th upload: its project goes, its file stays for its clips
    expect(all.filter((p) => !p.fileId)).toHaveLength(12);
    expect(all.some((p) => p.id === "pod")).toBe(false);
    expect(all.filter((p) => p.fileId === "pod")).toHaveLength(32);
    expect(deleted).toEqual([]);
    for (let i = 32; i < 41; i++) saveProject("u", project(`clip${i}`, "pod"));
    expect(loadProjects("u").filter((p) => p.fileId === "pod")).toHaveLength(40);
    saveProject("u", project("up12"));
    expect(deleted).toEqual(["up0"]);
  });

  it("deletes an AI video's Speak parts with its project, unless a kept project still uses them", () => {
    const parts = (ids: string[]) => ({ kind: "avatar", madeAt: "2026-10-22T00:00:00.000Z", slices: ids.map((clip, i) => ({ text: "Hi.", start: i, end: i + 1, clip })) });
    saveProject("u", { ...project("ai1"), ai: parts(["ai-slice-j1-0-0", "ai-slice-j1-1-0"]) } as never);
    saveProject("u", { ...project("ai2"), ai: parts(["ai-slice-j1-1-0"]) } as never);
    deleted.length = 0;
    removeProject("u", "ai1");
    expect(deleted).toEqual(["ai1", "ai-slice-j1-0-0"]);
  });

  it("deletes no video file when the save fails because storage is full", () => {
    for (let i = 0; i < 12; i++) saveProject("u", project(`up${i}`));
    window.localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => saveProject("u", project("up12"))).toThrow();
    // the list on the device still holds up0, so its video must still be there
    expect(loadProjects("u").some((p) => p.id === "up0")).toBe(true);
    expect(deleted).toEqual([]);
  });
});

describe("a project made from a post", () => {
  beforeEach(() => vi.stubGlobal("window", { localStorage: memoryStorage() }));
  const project = (draftId: unknown) => ({ id: "v1", name: "v1", createdAt: "", updatedAt: "", duration: 8, size: 1, words: [], settings: {} as never, thumb: "", draftId: draftId as string });

  it("keeps its draftId through a save and a load", () => {
    saveProject("u", project("d1"));
    expect(loadProjects("u")[0].draftId).toBe("d1");
  });

  it("reads a draftId that isn't a string as none, and leaves the rest of the list as it was", () => {
    for (const bad of [5, null, { id: "d1" }, ["d1"]]) {
      window.localStorage.setItem("content-studio-videoprojects-u", JSON.stringify([project(bad), project("d2"), "junk"]));
      const [first, second, third] = loadProjects("u");
      expect(first.draftId).toBeUndefined();
      expect(first.name).toBe("v1");
      expect(second.draftId).toBe("d2");
      expect(third).toBe("junk");
    }
  });

  it("loads a list saved today exactly as it was stored, with no field added", () => {
    const today = [
      { ...project("d1"), caption: "Cap.", fileId: "v1-s1", source: { kind: "ad", id: "a1" } },
      { id: "v2", name: "v2", createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-21T00:00:00.000Z", duration: 12, size: 9, words: [{ w: "Hi", s: 0, e: 0.4 }], settings: { style: "bold" }, thumb: "data:x" },
    ];
    window.localStorage.setItem("content-studio-videoprojects-u", JSON.stringify(today));
    expect(loadProjects("u")).toStrictEqual(today);
  });
});

describe("the AI mark", () => {
  beforeEach(() => vi.stubGlobal("window", { localStorage: memoryStorage() }));
  const MADE = "2026-10-21T09:15:00.000Z";
  const slices = [{ text: "Hi, I'm Leo.", start: 0, end: 4.2, clip: "ai-slice-j1-0-0" }, { text: "Here's why.", start: 4.2, end: 9, clip: "ai-slice-j1-1-0" }];
  const full: AiMark = { kind: "avatar", person: "mine", who: "face-abc", voice: "premade", madeAt: MADE, voiceId: "alice", lang: "en", slices };
  const project = (ai: unknown) => ({ id: "v1", name: "v1", createdAt: "", updatedAt: "", duration: 9, size: 1, words: [], settings: {} as never, thumb: "", ai: ai as AiMark });

  it("keeps a good mark, every field of it", () => {
    expect(aiOf(full)).toStrictEqual(full);
    expect(aiOf({ kind: "explainer", person: "generated", madeAt: MADE })).toStrictEqual({ kind: "explainer", person: "generated", madeAt: MADE });
    for (const kind of ["template", "dub"]) expect(aiOf({ kind, madeAt: MADE })).toStrictEqual({ kind, madeAt: MADE });
  });

  it("is no mark without a known kind and a date", () => {
    for (const junk of [undefined, null, "avatar", 5, [], {}, { kind: "swap", madeAt: MADE }, { kind: "avatar" }, { kind: "avatar", madeAt: "yesterday" }, { kind: "avatar", madeAt: 5 }])
      expect(aiOf(junk)).toBeUndefined();
  });

  it("drops each bad field and anything it doesn't know, keeping the rest", () => {
    expect(aiOf({ kind: "avatar", madeAt: MADE, person: "someone", who: 7, voice: "clone", voiceId: "rachel", lang: "fr", source: "https://x", agreedAt: MADE }))
      .toStrictEqual({ kind: "avatar", madeAt: MADE });
    expect(aiOf({ ...full, who: "" })).not.toHaveProperty("who");
  });

  it("drops every part when one is bad, so a remake can't land on the wrong one", () => {
    const bad = [
      { ...slices[1], clip: "hd-demo" }, { ...slices[1], start: -1 }, { ...slices[1], end: 4.2 }, { ...slices[1], end: Infinity },
      { ...slices[1], text: 5 }, { ...slices[1], start: "4.2" }, null,
    ];
    for (const b of bad) expect(aiOf({ ...full, slices: [slices[0], b] }), JSON.stringify(b)).not.toHaveProperty("slices");
    expect(aiOf({ ...full, slices: [] })).not.toHaveProperty("slices");
    expect(aiOf({ ...full, slices: "ai-slice-j1-0-0" })).not.toHaveProperty("slices");
    expect(aiOf({ ...full, slices: [{ ...slices[0], extra: "x" }] })?.slices).toStrictEqual([slices[0]]);
  });

  it("keeps a mark through a save and a load, and reads a junk one as none with the rest of the project", () => {
    saveProject("u", project(full));
    expect(loadProjects("u")[0].ai).toStrictEqual(full);
    window.localStorage.setItem("content-studio-videoprojects-u", JSON.stringify([project({ kind: "avatar" }), project({ ...full, voiceId: "nope" })]));
    const [junk, good] = loadProjects("u");
    expect(junk.ai).toBeUndefined();
    expect(junk.name).toBe("v1");
    const { voiceId: _gone, ...rest } = full;
    expect(good.ai).toStrictEqual(rest);
  });

  it("reads an old project, saved before the mark, as none", () => {
    const old = { id: "v0", name: "Old", createdAt: "", updatedAt: "", duration: 8, size: 1, words: [], settings: {}, thumb: "" };
    window.localStorage.setItem("content-studio-videoprojects-u", JSON.stringify([old]));
    const [p] = loadProjects("u");
    expect(p.ai).toBeUndefined();
    expect(p).toStrictEqual(old);
  });
});

describe("removeProject", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    deleted.length = 0;
  });
  const project = (id: string, fileId?: string) => ({ id, name: id, createdAt: "", updatedAt: "", duration: 60, size: 1, words: [], settings: {} as never, thumb: "", ...(fileId ? { fileId } : {}) });

  it("keeps the video file while a clip still uses it, and deletes it with the last project that does", () => {
    saveProject("u", project("pod"));
    saveProject("u", project("c1", "pod"));
    saveProject("u", project("c2", "pod"));
    expect(removeProject("u", "pod").map((p) => p.id)).toEqual(["c2", "c1"]);
    removeProject("u", "c1");
    expect(deleted).toEqual([]);
    expect(removeProject("u", "c2")).toEqual([]);
    expect(deleted).toEqual(["pod"]);
    expect(loadProjects("u")).toEqual([]);
  });

  it("deletes an upload's own file, and nothing for a project that isn't there", () => {
    saveProject("u", project("a"));
    saveProject("u", project("b"));
    removeProject("u", "nope");
    expect(deleted).toEqual([]);
    expect(removeProject("u", "a").map((p) => p.id)).toEqual(["b"]);
    expect(deleted).toEqual(["a"]);
  });
});

describe("where projects are kept", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    deleted.length = 0;
  });
  const project = (id: string) => ({ id, name: id, createdAt: "", updatedAt: "", duration: 60, size: 1, words: [], settings: {} as never, thumb: "" });

  it("keeps each profile's videos apart, under synced content-studio- keys", () => {
    saveProject("u", project("mine"));
    const client = addProfile("u", "Client A");
    setActiveProfile("u", client.id);
    expect(loadProjects("u")).toEqual([]);
    saveProject("u", project("theirs"));
    const ls = window.localStorage;
    const keys = Array.from({ length: ls.length }, (_, i) => ls.key(i)).filter((k) => k?.includes("videoprojects"));
    expect(keys).toEqual(["content-studio-videoprojects-u", `content-studio-videoprojects-u~${client.id}`]);
    setActiveProfile("u", "me");
    expect(loadProjects("u").map((p) => p.id)).toEqual(["mine"]);
  });

  it("opens an empty list, not a crash, when the stored list is unreadable", () => {
    window.localStorage.setItem("content-studio-videoprojects-u", "{not json");
    expect(loadProjects("u")).toEqual([]);
    window.localStorage.setItem("content-studio-videoprojects-u", JSON.stringify({ id: "x" }));
    expect(loadProjects("u")).toEqual([]);
    expect(loadProjects(null)).toEqual([]);
  });
});

describe("caption fixes", () => {
  beforeEach(() => vi.stubGlobal("window", { localStorage: memoryStorage() }));

  it("keeps the cleaned list per profile and still applies it when storage is full", () => {
    const clean = saveFixes("u", [{ from: "  acme   insure ", to: "AcmeInsure" }, { from: "Acme insure", to: "x" }, { from: "", to: "y" }]);
    expect(clean).toEqual([{ from: "acme insure", to: "AcmeInsure" }]);
    expect(loadFixes("u")).toEqual(clean);
    expect(window.localStorage.getItem("content-studio-captionfixes-u")).toBe(JSON.stringify(clean));
    window.localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(saveFixes("u", [{ from: "cpf", to: "CPF" }])).toEqual([{ from: "cpf", to: "CPF" }]);
    expect(loadFixes("u")).toEqual(clean);
  });
});

describe("swapping the video under a project", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    deleted.length = 0;
    put.length = 0;
    clipLength = 8;
  });
  const block = { id: "b", kind: "block" as const, text: "My words", x: 0.5, y: 0.5, size: 1, turn: 0, color: "#FFFFFF", from: 0, to: 20 };
  const sticker = { id: "s", kind: "arrow" as const, text: "", x: 0.5, y: 0.5, size: 1, turn: 0, color: "#FFFFFF", from: 10, to: 14 };
  const wall = { id: "v1", name: "v1", createdAt: "", updatedAt: "", duration: 20, size: 1, thumb: "data:old", words: [{ w: "hi", s: 0, e: 1 }],
    settings: { wall: true, captions: false, volume: 0, aspect: "9:16", trimStart: 2, trimEnd: 9, overlays: [block, sticker], faceTrack: { step: 1, x: [0.5] } } as never };

  it("keeps the look, clears the words, ends trims and stickers inside a shorter clip, and saves it on a new file", async () => {
    saveProject("u", wall);
    const next = await swapSource("u", "v1", new File(["x"], "clip.mp4", { type: "video/mp4" }));
    expect(next.fileId).toBe("v1-s1");
    expect(put).toEqual(["v1-s1"]);
    expect(next).toMatchObject({ duration: 8, size: 1, thumb: "data:new-thumb", words: [] });
    expect(next.settings).toMatchObject({ wall: true, captions: false, volume: 0, aspect: "9:16" });
    expect(next.settings.trimStart + next.settings.trimEnd).toBeLessThan(8);
    expect(next.settings.overlays?.map((o) => [o.from, o.to])).toEqual([[0, 8], [7.7, 8]]);
    expect(next.settings.faceTrack).toBeUndefined();
    expect(loadProjects("u")[0].fileId).toBe("v1-s1");
    // the old file stays for Undo
    expect(deleted).toEqual([]);
    clipLength = 30;
    const again = await swapSource("u", "v1", new File(["y"], "longer.mp4", { type: "video/mp4" }));
    expect(again.fileId).toBe("v1-s2");
    // the block ran to the end, so it still does
    expect(again.settings.overlays?.[0].to).toBe(30);
  });

  it("deletes every video a removed project had, except one a clip still uses", async () => {
    saveProject("u", wall);
    saveProject("u", { ...wall, id: "c1", fileId: "v1" });
    await swapSource("u", "v1", new File(["x"], "a.mp4"));
    await swapSource("u", "v1", new File(["y"], "b.mp4"));
    removeProject("u", "v1");
    // the clip was cut from the first upload, so that file stays
    expect(deleted).toEqual(["v1-s1", "v1-s2"]);
    removeProject("u", "c1");
    expect(deleted).toEqual(["v1-s1", "v1-s2", "v1"]);
  });

  it("refuses a video it can't open and leaves the project as it was", async () => {
    saveProject("u", wall);
    clipLength = Number.NaN;
    await expect(swapSource("u", "v1", new File(["x"], "bad.mov"))).rejects.toThrow("That video couldn't be opened. Try an MP4 or MOV.");
    expect(put).toEqual([]);
    expect(loadProjects("u")[0].fileId).toBeUndefined();
  });

  it("counts a swapped video as an upload, while a clip of another upload is still a clip", () => {
    const p = (id: string, fileId?: string) => ({ ...wall, id, ...(fileId ? { fileId } : {}) });
    for (let i = 0; i < 13; i++) saveProject("u", p(`up${i}`, `up${i}-s1`));
    // 13 uploads: the oldest goes, with its first upload and its swapped file
    expect(loadProjects("u")).toHaveLength(12);
    expect(deleted).toEqual(["up0", "up0-s1"]);
    saveProject("u", p("clip", "up5-s1"));
    expect(loadProjects("u")).toHaveLength(13);
  });
});

describe("transcribe", () => {
  const asked: string[] = [];
  beforeEach(() => {
    asked.length = 0;
    vi.stubGlobal("fetch", async (u: string) => (asked.push(u), Response.json({ words: [], text: "", duration: 1 })));
  });

  it("puts Leo's terms in the query, URL-encoded, next to lang", async () => {
    await transcribe(new Blob(["wav"]), "en", ["MediShield Life", "O'Brien & Co"]);
    expect(asked).toEqual(["/functions/v1/video-assist?mode=transcribe&lang=en&terms=MediShield%20Life%2CO'Brien%20%26%20Co"]);
  });
  it("asks as before with no terms", async () => {
    await transcribe(new Blob(["wav"]));
    await transcribe(new Blob(["wav"]), "ms", []);
    expect(asked).toEqual(["/functions/v1/video-assist?mode=transcribe", "/functions/v1/video-assist?mode=transcribe&lang=ms"]);
  });
});
