import { beforeEach, describe, expect, it, vi } from "vitest";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));
import {
  activeProfile,
  addProfile,
  brandGroups,
  isDemoBrand,
  DEFAULT_PROFILE_ID,
  loadProfiles,
  linkBoardBrand,
  removeProfile,
  renameProfile,
  scoped,
  scopeFor,
  setActiveProfile,
} from "./profiles";
import { localId, writeSharedBrands, type SharedBrand } from "./sharedBrands";
import { isSyncedKeyFor } from "./cloudSync";
import { loadDrafts, saveDrafts } from "./draftHistory";
import { isVoiceProfileUsable, loadVoiceProfile, saveVoiceProfile } from "./voiceProfile";
import { addCoachEntry, loadCoachHistory, type CoachReport } from "./coach";
// imported with the file, not inside the test: the MCP logic's first import transformed its whole graph there, which ran
// past 5 s under load (12 Nov)
import { createLink } from "./claudeConnect";
import { linkIsLive, linkKey } from "../../supabase/functions/content-studio-mcp/logic";

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

  it("turns off a Claude link still on when its profile is removed, so a device that still holds it can't bring it back", async () => {
    const ls = (globalThis as unknown as { window: { localStorage: MemStorage } }).window.localStorage;
    const mb = addProfile(UID, "MoneyBees");
    setActiveProfile(UID, mb.id);
    const { link } = await createLink(UID);
    const scope = `${UID}~${mb.id}`;
    setActiveProfile(UID, DEFAULT_PROFILE_ID);
    await removeProfile(UID, mb.id);
    // the other device uploads the link row again
    ls.setItem(linkKey(link.hash, scope), JSON.stringify({ createdAt: link.createdAt }));
    const keys = Array.from({ length: ls.length }, (_, i) => ls.key(i)!);
    expect(linkIsLive(keys, link.hash, scope)).toBe(false);
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
    await expect(removeProfile(UID, mb.id)).rejects.toThrow("Not enabled.");
    expect(loadProfiles(UID).map((p) => p.id)).toContain(mb.id);
    callFn.mockResolvedValue({ disconnected: 0 });
    await removeProfile(UID, mb.id);
    expect(loadProfiles(UID).map((p) => p.id)).not.toContain(mb.id);
  });

  it("removes a brand's server rows first, keeps it all when that fails, and clears this device's cs- data too", async () => {
    const ls = (globalThis as unknown as { window: { localStorage: MemStorage } }).window.localStorage;
    const mb = addProfile(UID, "MoneyBees");
    setActiveProfile(UID, mb.id);
    saveDrafts(UID, [{ id: "mb" } as never]);
    ls.setItem(`cs-track-draft-${UID}~${mb.id}`, "{}");
    ls.setItem(`cs-track-draft-${UID}`, "{}");
    callFn.mockResolvedValue({ disconnected: 0 });
    await expect(removeProfile(UID, mb.id, async () => { throw new Error("bio page still there"); })).rejects.toThrow("bio page");
    expect(loadProfiles(UID).map((p) => p.id)).toContain(mb.id);
    expect(loadDrafts(UID).map((d) => d.id)).toEqual(["mb"]);
    const cleaned: string[] = [];
    await removeProfile(UID, mb.id, async (id) => void cleaned.push(id));
    expect(cleaned).toEqual([mb.id]);
    expect(ls.getItem(`cs-track-draft-${UID}~${mb.id}`)).toBeNull();
    expect(ls.getItem(`cs-track-draft-${UID}`)).toBe("{}");
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

describe("the switcher's groups", () => {
  const p = (id: string, name: string, boardBrand?: string) => ({ id, name, createdAt: "", ...(boardBrand ? { boardBrand } : {}) });
  const list = [p("me", "Me"), p("mb", "MoneyBees", "moneybees"), p("d1", "FitHaus Studio", "dma-fithaus"), p("d2", "Brightsmile Dental", "dma-brightsmile")];

  it("puts your brands, then demo brands (board brand dma-), under their own headings", () => {
    expect(brandGroups(list).map((g) => [g.name, g.rows.map((r) => r.id)])).toEqual([["Your brands", ["me", "mb"]], ["Demo brands", ["d1", "d2"]]]);
    expect(isDemoBrand({ boardBrand: "moneybees" })).toBe(false);
  });

  it("filters by name in any case, and drops a group with no match", () => {
    expect(brandGroups(list, "  fitHAUS ").map((g) => [g.name, g.rows.map((r) => r.id)])).toEqual([["Demo brands", ["d1"]]]);
    expect(brandGroups(list, "money").map((g) => g.name)).toEqual(["Your brands"]);
    expect(brandGroups(list, "zzz")).toEqual([]);
  });

  it("gives no heading to an account with no demo brands", () => {
    expect(brandGroups(list.slice(0, 2))).toEqual([{ name: null, rows: list.slice(0, 2) }]);
  });
});

describe("a brand shared with this account (docs/shared-brands.md)", () => {
  const OWNER = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const BRAND = "11111111-2222-4333-8444-555555555555";
  const shared: SharedBrand = { brand: BRAND, owner: OWNER, profile: "pabc1", name: "Acme", role: "member" };
  const sharedMe: SharedBrand = { brand: "22222222-2222-4333-8444-555555555555", owner: OWNER, profile: "me", name: "Owner Co", role: "member" };
  const LIST = `content-studio-profiles-${UID}`;

  it("joins the brand list under its own id, and opening it reads and writes the owner's keys", () => {
    writeSharedBrands(UID, [shared, sharedMe, { ...shared, brand: "33333333-2222-4333-8444-555555555555", role: "owner" }]);
    expect(loadProfiles(UID).map((p) => p.id)).toEqual([DEFAULT_PROFILE_ID, localId(BRAND), localId(sharedMe.brand)]);
    setActiveProfile(UID, localId(BRAND));
    expect(scoped(UID)).toBe(`${OWNER}~pabc1`);
    saveDrafts(UID, [{ id: "x" } as never]);
    expect(window.localStorage.getItem(`content-studio-drafts-${OWNER}~pabc1`)).toContain('"x"');
    setActiveProfile(UID, localId(sharedMe.brand));
    expect(scoped(UID)).toBe(OWNER);
    expect(scopeFor(UID, localId(BRAND))).toBe(`${OWNER}~pabc1`);
    expect(scopeFor(UID, DEFAULT_PROFILE_ID)).toBe(UID);
  });

  it("never reaches the account's synced brand list, whichever way the list is saved (review finding 12)", async () => {
    writeSharedBrands(UID, [shared]);
    const mine = addProfile(UID, "Mine");
    renameProfile(UID, mine.id, "Mine too");
    linkBoardBrand(UID, mine.id, "moneybees");
    await removeProfile(UID, mine.id);
    const saved = JSON.parse(window.localStorage.getItem(LIST) ?? "[]") as { id: string }[];
    expect(saved.some((p) => p.id === localId(BRAND))).toBe(false);
    expect(saved.some((p) => "shared" in p)).toBe(false);
  });

  it("can't be renamed or removed from here: only the owner does that, and a member leaves", async () => {
    writeSharedBrands(UID, [shared]);
    window.localStorage.setItem(`content-studio-plan-${OWNER}~pabc1`, "kept");
    expect(renameProfile(UID, localId(BRAND), "Mine now").find((p) => p.id === localId(BRAND))?.name).toBe("Acme");
    await removeProfile(UID, localId(BRAND));
    expect(window.localStorage.getItem(`content-studio-plan-${OWNER}~pabc1`)).toBe("kept");
    expect(callFn).not.toHaveBeenCalled();
  });

  it("is gone once this device no longer lists it, and the studio falls back to the default brand", () => {
    writeSharedBrands(UID, [shared]);
    setActiveProfile(UID, localId(BRAND));
    writeSharedBrands(UID, []);
    expect(activeProfile(UID).id).toBe(DEFAULT_PROFILE_ID);
    expect(scoped(UID)).toBe(UID);
  });

  it("sits under its own heading in the switcher", () => {
    writeSharedBrands(UID, [shared]);
    expect(brandGroups(loadProfiles(UID)).map((g) => [g.name, g.rows.map((r) => r.id)])).toEqual([
      ["Your brands", [DEFAULT_PROFILE_ID]],
      ["Shared with you", [localId(BRAND)]],
    ]);
  });
});
