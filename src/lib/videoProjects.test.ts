import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadFixes, loadProjects, removeProject, saveFixes, saveProject } from "./videoProjects";
import { addProfile, setActiveProfile } from "@/lib/profiles";

const deleted: string[] = [];
vi.mock("@/lib/supabase", () => ({ supabase: {}, SUPABASE_ANON_KEY: "", SUPABASE_URL: "" }));
vi.mock("@/lib/edgeFn", () => ({ callFn: vi.fn() }));
vi.mock("@/lib/videoMedia", () => ({ deleteFile: (k: string) => (deleted.push(k), Promise.resolve()) }));

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
