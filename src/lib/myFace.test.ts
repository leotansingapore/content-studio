import { beforeEach, describe, expect, it, vi } from "vitest";
import { FACE_FRAMES, FACE_KEY_PREFIX, MAX_HISTORY, faceRecord, loadFace, oneFaceShown, saveFace, turnOffFace, verifiedDate } from "./myFace";
import { MAX_IMAGE_CHARS } from "./carousel";
import type { FaceBox } from "./videoMotion";

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
const OTHER = "0b7e1c2a-0000-4000-8000-000000000002";
const PHOTO = `data:image/jpeg;base64,/9j/${"A".repeat(400)}`;
const HASH = "ab".repeat(32);
const CONSENT = { at: "2026-10-21T09:15:00.000Z", line: "I'm the person on camera. I agree that Content Studio can make videos of my face. My code is 4 8 2 1.", heard: "My code is 4821.", token: "bGlrZW5lc3M.cd" };
const NOW = new Date("2026-10-21T09:15:02.000Z");
const stored = (uid = UID) => JSON.parse(storage.getItem(`${FACE_KEY_PREFIX}${uid}`) ?? "null");

beforeEach(() => {
  storage = new MemStorage();
  changed.mockClear();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, dispatchEvent: (e: Event) => changed(e.type), addEventListener: () => {}, removeEventListener: () => {} });
});

describe("the saved face", () => {
  it("is synced under the bare uid, one per person for every brand", () => {
    expect(FACE_KEY_PREFIX).toBe("content-studio-myface-");
    saveFace(UID, { photo: PHOTO, photoHash: HASH, consent: CONSENT }, NOW);
    expect([...storage.s.keys()]).toEqual([`content-studio-myface-${UID}`]);
  });

  it("saves on, with a history row, and says so", () => {
    const r = saveFace(UID, { photo: PHOTO, photoHash: HASH, consent: CONSENT }, NOW);
    expect(r.ok).toBe(true);
    expect(stored()).toEqual({
      id: `face-${NOW.getTime().toString(36)}`,
      photo: PHOTO,
      photoHash: HASH,
      consent: CONSENT,
      status: "on",
      history: [{ id: `face-${NOW.getTime().toString(36)}`, at: NOW.toISOString(), status: "on", photoHash: HASH }],
    });
    expect(loadFace(UID)).toEqual(stored());
    expect(loadFace(OTHER)).toBeNull();
    expect(changed).toHaveBeenCalledWith("content-studio-myface-changed");
  });

  it("marks the face a new recording replaces", () => {
    saveFace(UID, { photo: PHOTO, photoHash: HASH, consent: CONSENT }, NOW);
    const later = new Date(NOW.getTime() + 60_000);
    saveFace(UID, { photo: PHOTO, photoHash: "cd".repeat(32), consent: CONSENT }, later);
    expect(stored().history.map((h: { status: string; photoHash: string }) => [h.status, h.photoHash.slice(0, 2)])).toEqual([["on", "ab"], ["replaced", "ab"], ["on", "cd"]]);
    expect(loadFace(UID)?.photoHash).toBe("cd".repeat(32));
  });

  it("turns off by emptying the photo: the key, hash, consent and history stay, and load gives null", () => {
    saveFace(UID, { photo: PHOTO, photoHash: HASH, consent: CONSENT }, NOW);
    const off = turnOffFace(UID, new Date(NOW.getTime() + 1000));
    expect(off?.ok).toBe(true);
    const s = stored();
    expect(s).toMatchObject({ photo: "", status: "off", photoHash: HASH, consent: CONSENT });
    expect(s.history.map((h: { status: string }) => h.status)).toEqual(["on", "off"]);
    expect(loadFace(UID)).toBeNull();
    expect(faceRecord(UID)?.status).toBe("off");
    // nothing more to turn off
    expect(turnOffFace(UID)).toBeNull();
  });

  it("refuses a photo over MAX_IMAGE_CHARS or not a JPEG, and writes nothing", () => {
    const big = `data:image/jpeg;base64,/9j/${"A".repeat(MAX_IMAGE_CHARS)}`;
    expect(saveFace(UID, { photo: big, photoHash: HASH, consent: CONSENT })).toEqual({ ok: false, error: "That photo is too big to save. Record again." });
    expect(saveFace(UID, { photo: "data:image/png;base64,iVBOR", photoHash: HASH, consent: CONSENT }).ok).toBe(false);
    expect(storage.s.size).toBe(0);
  });

  it("says so in a line when the device is full, and keeps the face it had", () => {
    saveFace(UID, { photo: PHOTO, photoHash: HASH, consent: CONSENT }, NOW);
    storage.full = 100;
    const r = saveFace(UID, { photo: PHOTO, photoHash: "cd".repeat(32), consent: CONSENT });
    expect(r).toEqual({ ok: false, error: "This device is out of room, so your face wasn't saved. Clear some space, then try again." });
    expect(loadFace(UID)?.photoHash).toBe(HASH);
  });

  it("keeps the newest 20 history rows", () => {
    for (let i = 0; i < 15; i++) saveFace(UID, { photo: PHOTO, photoHash: HASH, consent: CONSENT }, new Date(NOW.getTime() + i * 1000));
    expect(stored().history).toHaveLength(MAX_HISTORY);
    expect(stored().history.at(-1).status).toBe("on");
  });

  it("reads junk as nothing: bad JSON, an on face with no photo, a made-up hash or a photo that isn't a JPEG", () => {
    const put = (v: unknown) => storage.s.set(`${FACE_KEY_PREFIX}${UID}`, typeof v === "string" ? v : JSON.stringify(v));
    put("{oops");
    expect(faceRecord(UID)).toBeNull();
    saveFace(UID, { photo: PHOTO, photoHash: HASH, consent: CONSENT }, NOW);
    const good = stored();
    for (const bad of [{ ...good, photo: "" }, { ...good, photoHash: "not-a-hash" }, { ...good, photo: "data:image/png;base64,iVBOR" }, { ...good, status: "maybe" }, { ...good, consent: { ...CONSENT, token: 5 } }]) {
      put(bad);
      expect(loadFace(UID)).toBeNull();
    }
    put({ ...good, history: [{ id: "x" }, ...good.history, "junk"] });
    expect(loadFace(UID)?.history).toEqual(good.history);
  });

  it("dates the Verified chip in Singapore time", () => {
    expect(verifiedDate("2026-10-21T17:30:00.000Z")).toBe("22 Oct 2026");
    expect(verifiedDate(CONSENT.at)).toBe("21 Oct 2026");
  });
});

describe("oneFaceShown", () => {
  const face = (h = 0.3): FaceBox => ({ x0: 0.3, y0: 0.2, x1: 0.6, y1: 0.2 + h });
  const frames = (good: number, rest: FaceBox[] = []) => Array.from({ length: FACE_FRAMES }, (_, i) => (i < good ? [face()] : rest));

  it("passes with one big enough face in 9 of 12 frames, and fails at 8", () => {
    expect(oneFaceShown(frames(12))).toBe(true);
    expect(oneFaceShown(frames(9))).toBe(true);
    expect(oneFaceShown(frames(8))).toBe(false);
    expect(oneFaceShown([])).toBe(false);
  });

  it("counts a frame with two faces as a miss", () => {
    const two = frames(12).map((f, i) => (i < 4 ? [...f, face()] : f));
    expect(oneFaceShown(two)).toBe(false);
    expect(oneFaceShown(frames(9).map((f, i) => (i === 0 ? [...f, face()] : f)))).toBe(false);
  });

  it("counts a face under 20% of the frame's height as a miss", () => {
    expect(oneFaceShown(Array.from({ length: 12 }, () => [face(0.19)]))).toBe(false);
    expect(oneFaceShown(Array.from({ length: 12 }, () => [face(0.2)]))).toBe(true);
  });
});
