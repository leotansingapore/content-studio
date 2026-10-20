import { beforeEach, describe, expect, it } from "vitest";
import { addProfile, DEFAULT_PROFILE_ID, setActiveProfile } from "./profiles";
import { isSyncedKeyFor } from "./cloudSync";
import { isSaved, loadSaved, savedCount, toggleSaved } from "./savedItems";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const KEY = `content-studio-saved-${UID}`;

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
let storage: MemStorage;

beforeEach(() => {
  storage = new MemStorage();
  (globalThis as { window?: unknown }).window = { localStorage: storage };
});

describe("saved items", () => {
  it("saves the newest first, and a second tap takes it out again", () => {
    toggleSaved(UID, "inspiration", "a");
    expect(toggleSaved(UID, "inspiration", "b").inspiration).toEqual(["b", "a"]);
    expect(loadSaved(UID).inspiration).toEqual(["b", "a"]);
    toggleSaved(UID, "inspiration", "a");
    expect(isSaved(loadSaved(UID), "inspiration", "a")).toBe(false);
    expect(loadSaved(UID).inspiration).toEqual(["b"]);
  });

  it("keeps each brand's saved items apart, under synced keys, the default brand on the old key", () => {
    toggleSaved(UID, "creators", "c1");
    expect(JSON.parse(storage.getItem(KEY)!).creators).toEqual(["c1"]);
    const mb = addProfile(UID, "MoneyBees");
    setActiveProfile(UID, mb.id);
    expect(loadSaved(UID).creators).toEqual([]);
    toggleSaved(UID, "creators", "c2");
    expect(isSyncedKeyFor(`${KEY}~${mb.id}`, UID)).toBe(true);
    expect(JSON.parse(storage.getItem(`${KEY}~${mb.id}`)!).creators).toEqual(["c2"]);
    setActiveProfile(UID, DEFAULT_PROFILE_ID);
    expect(loadSaved(UID).creators).toEqual(["c1"]);
  });

  it("reads a save from before top posts without losing the rest, and a damaged one as empty", () => {
    storage.setItem(KEY, JSON.stringify({ inspiration: ["i1"], creators: ["c1"] }));
    const old = loadSaved(UID);
    expect(old).toEqual({ inspiration: ["i1"], creators: ["c1"], topPosts: [] });
    expect(savedCount(old)).toBe(2);
    toggleSaved(UID, "topPosts", "adv1-ABC123");
    expect(loadSaved(UID)).toEqual({ inspiration: ["i1"], creators: ["c1"], topPosts: ["adv1-ABC123"] });
    storage.setItem(KEY, "{oops");
    expect(loadSaved(UID)).toEqual({ inspiration: [], creators: [], topPosts: [] });
    expect(loadSaved(null)).toEqual({ inspiration: [], creators: [], topPosts: [] });
  });
});
