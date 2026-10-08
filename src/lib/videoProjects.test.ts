import { beforeEach, describe, expect, it, vi } from "vitest";

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
    const { loadProjects, saveProject } = await import("./videoProjects");
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
