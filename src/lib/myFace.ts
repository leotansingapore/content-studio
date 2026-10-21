// Your face, saved once (people-my-face, Leo only): one verified photo, the record of what was agreed, and the
// on-device rule a recording must pass before anything is sent. The photo comes only from a recording whose spoken
// code ai-video heard (faceRecorder.ts); its hash and consent token are the server's. Turning it off empties the
// photo and keeps the record: cloudSync has no tombstones, so a deletion is never the only record.

import { MAX_IMAGE_CHARS } from "@/lib/carousel";
import type { FaceBox } from "@/lib/videoMotion";

/**
 * Leo's answer to Q2 (21 Oct): synced in his own cs_user_data row, so both devices have it. Had he said no, this
 * would be "cs-myface-" and the face would stay on each device. Keyed on the bare uid: a face is the person's, for
 * every brand of the account.
 */
export const FACE_KEY_PREFIX = "content-studio-myface-";
export const FACE_CHANGED = "content-studio-myface-changed";
const keyOf = (userId: string) => `${FACE_KEY_PREFIX}${userId}`;

export interface MyFace {
  /** "face-<base36 time>" */
  id: string;
  /** A 9:16 JPEG data URL, at most 720x1280 and MAX_IMAGE_CHARS; "" once turned off. */
  photo: string;
  /** sha256 hex of the JPEG bytes, worked out by the server. */
  photoHash: string;
  /** From ai-video mode consent: when, the line read, what Whisper heard and the server's signed token. */
  consent: { at: string; line: string; heard: string; token: string };
  status: "on" | "off";
  /** Append only, newest 20 kept. */
  history: { id: string; at: string; status: "on" | "off" | "replaced"; photoHash: string }[];
}

export const MAX_HISTORY = 20;
const JPEG_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
const HASH = /^[0-9a-f]{64}$/;
const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);

/** The stored record, on or off, or null when there is none or it doesn't read. */
export function faceRecord(userId: string): MyFace | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(localStorage.getItem(keyOf(userId)) ?? "null");
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const c = (raw.consent ?? {}) as Record<string, unknown>;
  const consent = { at: str(c.at, 40), line: str(c.line, 300), heard: str(c.heard, 500), token: str(c.token, 400) };
  const id = str(raw.id, 40);
  const photoHash = str(raw.photoHash, 64);
  const status = raw.status === "on" || raw.status === "off" ? raw.status : null;
  const photo = typeof raw.photo === "string" && (raw.photo === "" || (raw.photo.length <= MAX_IMAGE_CHARS && JPEG_URL.test(raw.photo))) ? raw.photo : null;
  if (!id || !photoHash || !HASH.test(photoHash) || !status || photo === null || Object.values(consent).some((v) => v === null)) return null;
  if (status === "on" && !photo) return null;
  const history = (Array.isArray(raw.history) ? raw.history : []).flatMap((h: Record<string, unknown>) => {
    const row = { id: str(h?.id, 40), at: str(h?.at, 40), status: ["on", "off", "replaced"].includes(h?.status as string) ? (h.status as MyFace["history"][number]["status"]) : null, photoHash: str(h?.photoHash, 64) };
    return row.id && row.at && row.status && row.photoHash ? [row as MyFace["history"][number]] : [];
  });
  return { id, photo, photoHash, consent: consent as MyFace["consent"], status, history: history.slice(-MAX_HISTORY) };
}

/** The face to make videos from: only a verified record that is on. */
export function loadFace(userId: string): MyFace | null {
  const f = faceRecord(userId);
  return f?.status === "on" ? f : null;
}

type Saved = { ok: true; face: MyFace } | { ok: false; error: string };

function write(userId: string, face: MyFace): Saved {
  try {
    localStorage.setItem(keyOf(userId), JSON.stringify(face));
  } catch {
    return { ok: false, error: "This device is out of room, so your face wasn't saved. Clear some space, then try again." };
  }
  window.dispatchEvent(new Event(FACE_CHANGED));
  return { ok: true, face };
}

/** Saves a checked face: on, with a history row (and a "replaced" row for the face it replaces). */
export function saveFace(userId: string, f: { photo: string; photoHash: string; consent: MyFace["consent"] }, now = new Date()): Saved {
  if (f.photo.length > MAX_IMAGE_CHARS || !JPEG_URL.test(f.photo)) return { ok: false, error: "That photo is too big to save. Record again." };
  const at = now.toISOString();
  const prev = faceRecord(userId);
  const id = `face-${now.getTime().toString(36)}`;
  const history = [
    ...(prev?.history ?? []),
    ...(prev?.status === "on" ? [{ id: prev.id, at, status: "replaced" as const, photoHash: prev.photoHash }] : []),
    { id, at, status: "on" as const, photoHash: f.photoHash },
  ].slice(-MAX_HISTORY);
  return write(userId, { id, photo: f.photo, photoHash: f.photoHash, consent: f.consent, status: "on", history });
}

/** Turns the face off: the photo leaves the record (and sync on the next push); hash, consent and history stay. */
export function turnOffFace(userId: string, now = new Date()): Saved | null {
  const prev = faceRecord(userId);
  if (!prev || prev.status === "off") return null;
  const history = [...prev.history, { id: prev.id, at: now.toISOString(), status: "off" as const, photoHash: prev.photoHash }].slice(-MAX_HISTORY);
  return write(userId, { ...prev, photo: "", status: "off", history });
}

/** Re-reads on a save here, in another tab or from sync. */
export function onFaceChanged(fn: () => void): () => void {
  const storage = (e: StorageEvent) => (e.key === null || e.key.startsWith(FACE_KEY_PREFIX)) && fn();
  window.addEventListener(FACE_CHANGED, fn);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(FACE_CHANGED, fn);
    window.removeEventListener("storage", storage);
  };
}

// ---------- the on-device face rule ----------

export const FACE_FRAMES = 12;
export const FACE_FRAMES_NEEDED = 9;
/** The face's box against the frame's height: a face far back in the room is not a face to make videos from. */
export const MIN_FACE_HEIGHT = 0.2;

/** A frame that counts: exactly one face (facesIn already drops the tiny ones), at least MIN_FACE_HEIGHT tall. */
export const oneFaceIn = (boxes: FaceBox[]) => boxes.length === 1 && boxes[0].y1 - boxes[0].y0 >= MIN_FACE_HEIGHT;

/** Passes when FACE_FRAMES_NEEDED of the frames (12 looked at) show one big enough face; two faces count as a miss. */
export function oneFaceShown(frames: FaceBox[][]): boolean {
  return frames.filter(oneFaceIn).length >= FACE_FRAMES_NEEDED;
}

/** "21 Oct 2026" for the Verified chip. */
export const verifiedDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" });
