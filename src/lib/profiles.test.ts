import { beforeEach, describe, expect, it, vi } from "vitest";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));
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
import { isVoiceProfileUsable, loadVoiceProfile, saveVoiceProfile } from "./voiceProfile";
import { addCoachEntry, loadCoachHistory, type CoachReport } from "./coach";

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
  callFn.mockReset().mockResolvedValue({ disconnected: 0 });
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

  it("renames, and removing a profile deletes only its data and falls back to the default", async () => {
    const mb = addProfile(UID, "MoneyBees");
    renameProfile(UID, mb.id, "  The MoneyBees ");
    expect(loadProfiles(UID)[1].name).toBe("The MoneyBees");
    setActiveProfile(UID, mb.id);
    saveDrafts(UID, [{ id: "mb" } as never]);
    setActiveProfile(UID, DEFAULT_PROFILE_ID);
    saveDrafts(UID, [{ id: "me" } as never]);
    setActiveProfile(UID, mb.id);
    await removeProfile(UID, mb.id);
    expect(callFn).toHaveBeenCalledWith("social", { action: "disconnect", profileId: mb.id, all: true });
    expect(activeProfile(UID).id).toBe(DEFAULT_PROFILE_ID);
    expect(loadDrafts(UID).map((d) => d.id)).toEqual(["me"]);
    const ls = (globalThis as unknown as { window: { localStorage: MemStorage } }).window.localStorage;
    expect(ls.getItem(`content-studio-drafts-${UID}~${mb.id}`)).toBeNull();
    expect((await removeProfile(UID, DEFAULT_PROFILE_ID)).map((p) => p.id)).toEqual([DEFAULT_PROFILE_ID]);
    expect(callFn).toHaveBeenCalledTimes(1);
  });

  it("keeps a brand whose social accounts couldn't be disconnected", async () => {
    const { EdgeError } = await import("@/lib/edgeFn");
    const mb = addProfile(UID, "MoneyBees");
    setActiveProfile(UID, mb.id);
    saveDrafts(UID, [{ id: "mb" } as never]);
    callFn.mockRejectedValue(new EdgeError("Couldn't reach your social accounts.", 502));
    await expect(removeProfile(UID, mb.id)).rejects.toThrow("Couldn't reach");
    expect(loadProfiles(UID).map((p) => p.id)).toContain(mb.id);
    expect(loadDrafts(UID).map((d) => d.id)).toEqual(["mb"]);
    callFn.mockRejectedValue(new EdgeError("Not enabled.", 404));
    await removeProfile(UID, mb.id);
    expect(loadProfiles(UID).map((p) => p.id)).not.toContain(mb.id);
  });

  it("falls back to the default when the open profile was removed on another device", () => {
    setActiveProfile(UID, "pgone");
    expect(scoped(UID)).toBe(UID);
  });
});

describe("each profile's voice and Coach history", () => {
  const ls = () => (globalThis as unknown as { window: { localStorage: MemStorage } }).window.localStorage;
  const report = (score: number) => ({ score, postCount: 3, avgWords: 80, dimensions: [], strengths: [], fixes: [`fix ${score}`], perPost: [] }) as CoachReport;

  it("keeps the voice samples apart per profile, under synced keys", () => {
    const mb = addProfile(UID, "MoneyBees");
    saveVoiceProfile(UID, { posts: ["a".repeat(100), "b".repeat(100), "c".repeat(100)], updatedAt: "" });
    setActiveProfile(UID, mb.id);
    expect(loadVoiceProfile(UID)).toBeNull();
    saveVoiceProfile(UID, { posts: ["d".repeat(100), " ".repeat(5) + "e".repeat(99), "f".repeat(100)], updatedAt: "" });
    expect(isVoiceProfileUsable(loadVoiceProfile(UID))).toBe(false); // one sample is 99 characters once trimmed
    expect(ls().getItem(`content-studio-voice-${UID}~${mb.id}`)).not.toBeNull();
    setActiveProfile(UID, DEFAULT_PROFILE_ID);
    expect(isVoiceProfileUsable(loadVoiceProfile(UID))).toBe(true);
    expect(isSyncedKeyFor(`content-studio-voice-${UID}~${mb.id}`, UID)).toBe(true);
  });

  it("keeps the 30 newest Coach checks, per profile, and reads a damaged list as empty", () => {
    for (let i = 1; i <= 31; i++) addCoachEntry(UID, report(i));
    const list = loadCoachHistory(UID);
    expect(list).toHaveLength(30);
    expect([list[0].score, list[29].score]).toEqual([31, 2]);
    expect(list[0].topFix).toBe("fix 31");
    const mb = addProfile(UID, "MoneyBees");
    setActiveProfile(UID, mb.id);
    expect(loadCoachHistory(UID)).toEqual([]);
    addCoachEntry(UID, report(50));
    expect(JSON.parse(ls().getItem(`content-studio-coach-${UID}~${mb.id}`) ?? "[]")).toHaveLength(1);
    ls().setItem(`content-studio-coach-${UID}~${mb.id}`, JSON.stringify({ a: 1 }));
    expect(loadCoachHistory(UID)).toEqual([]);
  });
});
