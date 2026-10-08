import { beforeEach, describe, expect, it } from "vitest";
import {
  activeProfile,
  addProfile,
  DEFAULT_PROFILE_ID,
  loadProfiles,
  removeProfile,
  renameProfile,
  scoped,
  setActiveProfile,
} from "./profiles";
import { isSyncedKeyFor } from "./cloudSync";
import { loadDrafts, saveDrafts } from "./draftHistory";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: new MemStorage() };
});

describe("profiles", () => {
  it("starts with the default profile and leaves existing keys untouched", () => {
    expect(loadProfiles(UID).map((p) => p.id)).toEqual([DEFAULT_PROFILE_ID]);
    expect(scoped(UID)).toBe(UID);
    expect(scoped(null)).toBeNull();
  });

  it("keeps each profile's data apart and syncs it under the same account", () => {
    saveDrafts(UID, [{ id: "a" } as never]);
    const mb = addProfile(UID, "MoneyBees");
    setActiveProfile(UID, mb.id);
    expect(scoped(UID)).toBe(`${UID}~${mb.id}`);
    expect(isSyncedKeyFor(`content-studio-drafts-${scoped(UID)}`, UID)).toBe(true);
    expect(loadDrafts(UID)).toEqual([]);
    saveDrafts(UID, [{ id: "b" } as never]);
    setActiveProfile(UID, DEFAULT_PROFILE_ID);
    expect(loadDrafts(UID).map((d) => d.id)).toEqual(["a"]);
  });

  it("renames, and removing a profile deletes only its data and falls back to the default", () => {
    const mb = addProfile(UID, "MoneyBees");
    renameProfile(UID, mb.id, "  The MoneyBees ");
    expect(loadProfiles(UID)[1].name).toBe("The MoneyBees");
    setActiveProfile(UID, mb.id);
    saveDrafts(UID, [{ id: "mb" } as never]);
    setActiveProfile(UID, DEFAULT_PROFILE_ID);
    saveDrafts(UID, [{ id: "me" } as never]);
    setActiveProfile(UID, mb.id);
    removeProfile(UID, mb.id);
    expect(activeProfile(UID).id).toBe(DEFAULT_PROFILE_ID);
    expect(loadDrafts(UID).map((d) => d.id)).toEqual(["me"]);
    const ls = (globalThis as unknown as { window: { localStorage: MemStorage } }).window.localStorage;
    expect(ls.getItem(`content-studio-drafts-${UID}~${mb.id}`)).toBeNull();
    expect(removeProfile(UID, DEFAULT_PROFILE_ID).map((p) => p.id)).toEqual([DEFAULT_PROFILE_ID]);
  });

  it("falls back to the default when the open profile was removed on another device", () => {
    setActiveProfile(UID, "pgone");
    expect(scoped(UID)).toBe(UID);
  });
});
