import { beforeEach, describe, expect, it } from "vitest";
import { deleteNote, loadNotes, saveNote } from "./calendarNotes";
import { addProfile, setActiveProfile } from "./profiles";

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

let store: MemStorage;
beforeEach(() => {
  store = new MemStorage();
  (globalThis as { window?: unknown }).window = { localStorage: store };
});

describe("calendar notes", () => {
  it("adds, edits in place and deletes", () => {
    saveNote(UID, { id: "a", date: "2026-10-12", title: "  Webinar push ", color: "warning" });
    expect(loadNotes(UID)).toEqual([{ id: "a", date: "2026-10-12", title: "Webinar push", color: "warning" }]);
    saveNote(UID, { id: "a", date: "2026-10-13", title: "Webinar week", color: "success" });
    expect(loadNotes(UID)).toHaveLength(1);
    expect(loadNotes(UID)[0]).toMatchObject({ date: "2026-10-13", title: "Webinar week" });
    deleteNote(UID, "a");
    expect(loadNotes(UID)).toEqual([]);
  });

  it("keeps each profile's notes apart under a synced key", () => {
    saveNote(UID, { id: "me", date: "2026-10-12", title: "Mine", color: "brand" });
    const mb = addProfile(UID, "MoneyBees");
    setActiveProfile(UID, mb.id);
    expect(loadNotes(UID)).toEqual([]);
    saveNote(UID, { id: "mb", date: "2026-10-12", title: "Theirs", color: "brand" });
    expect(store.getItem(`content-studio-calnotes-${UID}~${mb.id}`)).toContain("Theirs");
    expect(store.getItem(`content-studio-calnotes-${UID}`)).toContain("Mine");
  });

  it("drops malformed rows and fixes an unknown colour", () => {
    store.setItem(
      `content-studio-calnotes-${UID}`,
      JSON.stringify([{ id: "x", date: "soon", title: "bad" }, { id: "y", date: "2026-10-12", title: "ok", color: "#f00" }]),
    );
    expect(loadNotes(UID)).toEqual([{ id: "y", date: "2026-10-12", title: "ok", color: "brand" }]);
  });
});
