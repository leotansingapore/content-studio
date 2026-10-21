import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FULL, MAX_ON, MAX_PHOTO, PRESENTERS_CHANGED, keepPresenter, loadPresenters, nameFor, onPresenters, removePresenter, renamePresenter, savePrefs, setWho,
} from "./presenters";
import { addProfile, setActiveProfile } from "./profiles";

class MemStorage {
  s = new Map<string, string>();
  full = Infinity;
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (v.length > this.full) throw new DOMException("full", "QuotaExceededError");
    this.s.set(k, v);
  }
  removeItem(k: string) { this.s.delete(k); }
}
let storage: MemStorage;
const changed = vi.fn();

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
// an AI-made picture's copy, never a real person
const PHOTO = `data:image/jpeg;base64,/9j/${"A".repeat(400)}`;
const LOOK = "A Chinese Singaporean woman in her early 30s, shoulder-length black hair, navy blazer over a white blouse";
const URL_ = "https://cdn.higgsfield.ai/soul/abc.png";
const at = (s: number) => new Date(Date.UTC(2026, 9, 21, 9, 0, s));
const keep = (name: string, s = 0, o: Partial<{ photo: string; look: string }> = {}) => keepPresenter(UID, { name, look: LOOK, url: URL_, photo: PHOTO, ...o }, at(s));
const kept = (name: string, s = 0) => {
  const r = keep(name, s);
  if (r.ok === false) throw new Error(r.error);
  return r.presenter;
};
const stored = (key = `content-studio-presenters-${UID}`) => JSON.parse(storage.getItem(key) ?? "null");

beforeEach(() => {
  storage = new MemStorage();
  changed.mockClear();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, dispatchEvent: (e: Event) => changed(e.type), addEventListener: () => {}, removeEventListener: () => {} });
});

describe("saved presenters", () => {
  it("start empty with Ask each time, and read as empty from bad JSON or junk", () => {
    expect(loadPresenters(UID)).toEqual({ who: "ask", prefs: {}, items: [] });
    storage.setItem(`content-studio-presenters-${UID}`, "{not json");
    expect(loadPresenters(UID)).toEqual({ who: "ask", prefs: {}, items: [] });
    storage.setItem(`content-studio-presenters-${UID}`, JSON.stringify({
      who: "pr-gone",
      prefs: { gender: "girl", age: "40s", dress: "office", extra: "x".repeat(121) },
      items: [{ id: "pr-1", name: "Mei", look: LOOK, url: "http://not-https", photo: PHOTO, createdAt: "x", status: "on" }, { id: "bad" }, null],
    }));
    expect(loadPresenters(UID)).toEqual({ who: "ask", prefs: { age: "40s", dress: "office" }, items: [] });
  });

  it("make the brand's first kept presenter its default, and keep it after a reload", () => {
    const presenter = kept("Mei");
    expect(presenter).toEqual({ id: `pr-${at(0).getTime().toString(36)}`, name: "Mei", look: LOOK, url: URL_, photo: PHOTO, createdAt: at(0).toISOString(), status: "on" });
    expect(loadPresenters(UID).who).toBe(presenter.id);
    expect(stored().items).toHaveLength(1);
    expect(changed).toHaveBeenCalledWith(PRESENTERS_CHANGED);
    // the second doesn't take over
    keep("Raj", 1);
    expect(loadPresenters(UID).who).toBe(presenter.id);
  });

  it("leave your own face as the choice when it was picked before the first presenter", () => {
    setWho(UID, "me");
    keep("Mei");
    expect(loadPresenters(UID).who).toBe("me");
  });

  it("keep at most 4 on, and refuse the 5th with the line", () => {
    for (let i = 0; i < MAX_ON; i++) expect(keep(`P${i}`, i).ok).toBe(true);
    expect(keep("Fifth", 9)).toEqual({ ok: false, error: FULL });
    expect(FULL).toBe("You have 4 presenters. Remove one to make another.");
    expect(onPresenters(loadPresenters(UID))).toHaveLength(4);
  });

  it("keep a removed presenter in the data with status off and no picture, so a fifth can be made", () => {
    const first = kept("Mei");
    for (let i = 1; i < MAX_ON; i++) keep(`P${i}`, i);
    expect(removePresenter(UID, first.id).ok).toBe(true);
    const p = loadPresenters(UID);
    expect(p.items.find((x) => x.id === first.id)).toEqual({ ...first, status: "off", photo: "" });
    // it was the default, so the choice falls back to Ask each time
    expect(p.who).toBe("ask");
    expect(onPresenters(p)).toHaveLength(3);
    expect(keep("Fifth", 9).ok).toBe(true);
    expect(setWho(UID, first.id)).toEqual({ ok: false, error: "That presenter is no longer here." });
  });

  it("rename, refusing an empty name and cutting a long one to 24 characters", () => {
    const { id } = kept("Mei");
    expect(renamePresenter(UID, id, "   ")).toEqual({ ok: false, error: "Give your presenter a name." });
    renamePresenter(UID, id, "  Mei from the Tampines branch office ");
    expect(loadPresenters(UID).items[0].name).toBe("Mei from the Tampines br");
  });

  it("refuse a picture copy over 120,000 characters or not a JPEG, and say so when the device is full", () => {
    expect(keep("Big", 0, { photo: `data:image/jpeg;base64,${"A".repeat(MAX_PHOTO)}` })).toEqual({ ok: false, error: "That picture is too big to save. Make it again." });
    expect(keep("Png", 0, { photo: "data:image/png;base64,iVBORw0KGgo" }).ok).toBe(false);
    storage.full = 10;
    expect(keep("Mei")).toEqual({ ok: false, error: "This device is out of room, so that wasn't saved. Clear some space, then try again." });
    expect(changed).not.toHaveBeenCalled();
  });

  it("keep the chips a new presenter starts from", () => {
    keep("Mei");
    savePrefs(UID, { gender: "man", background: "indian", extra: "Glasses" });
    expect(loadPresenters(UID)).toMatchObject({ prefs: { gender: "man", background: "indian", extra: "Glasses" }, items: [{ name: "Mei" }] });
  });

  it("keep each brand's presenters and choice apart", () => {
    const mei = kept("Mei");
    const brand = addProfile(UID, "MoneyBees");
    setActiveProfile(UID, brand.id);
    expect(loadPresenters(UID)).toEqual({ who: "ask", prefs: {}, items: [] });
    keep("Raj", 1);
    setWho(UID, "ask");
    expect(storage.getItem(`content-studio-presenters-${UID}~${brand.id}`)).not.toBeNull();
    setActiveProfile(UID, "me");
    expect(loadPresenters(UID)).toMatchObject({ who: mei.id, items: [{ name: "Mei" }] });
  });

  it("start a name from the look's background and gender, skipping names already used", () => {
    expect(nameFor(LOOK, [])).toBe("Mei");
    expect(nameFor(LOOK, ["Mei"])).toBe("Hui Min");
    expect(nameFor("An Indian Singaporean man in his 40s, short neat hair", [])).toBe("Raj");
    expect(nameFor("A Eurasian Singaporean woman in her 50s, cream blouse", [])).toBe("Sarah");
    expect(nameFor("Someone typed by hand", [])).toBe("Mei");
  });
});
