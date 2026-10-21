// Adding files on /media (brand-media-library step 1, Leo only). Each file is checked before anything is stored: its
// type (fileType, as Post it for me checks), its size, a video's length, 20 at a time, the 300-file library and the
// device's free space. Photos are kept as today (storePicture: a 1080 px JPEG under cimg-); a video keeps its own
// bytes under cvid- with a 240 px still under the cimg- key of the same id. Then each joins the sort queue. Runs
// outside React, so leaving the page mid-add still adds every file.

import { fileType } from "@/lib/autoPost";
import { deleteFile, putFile } from "@/lib/deviceFiles";
import { clock } from "@/lib/hookDemo";
import { addMedia, loadMedia, MAX_MEDIA, mediaRoom, storePicture, type MediaItem } from "@/lib/mediaLibrary";
import { sortMedia } from "@/lib/mediaSort";

export const MAX_PHOTO_BYTES = 10_000_000;
export const MAX_VIDEO_BYTES = 50_000_000;
export const MAX_VIDEO_SECONDS = 180;
export const MAX_AT_ONCE = 20;
export const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,.jpg,.jpeg,.png,.webp,.mp4,.mov";

export const PICK_LINE = `Pick up to ${MAX_AT_ONCE} at a time. Added the first ${MAX_AT_ONCE}.`;
export const FULL_LINE = `Media holds ${MAX_MEDIA} files. Remove some to add more.`;
export const SPACE_LINE = "This device is out of space for media. Remove some, or free up space on the device.";

type Picked = { name: string; type: string; size: number };
const mb = (bytes: number) => `${Math.ceil(bytes / 100_000) / 10} MB`;
// loaded on the first video only, so /media for everyone else never fetches the video code
let videoMedia: Promise<typeof import("@/lib/videoMedia")> | null = null;

/** Why this file can't be added, in the strip's words, or null. */
export function fileLine(f: Picked): string | null {
  const type = fileType(f);
  if (!type) return `${f.name} isn't a photo or video we can use.`;
  const video = type.startsWith("video/");
  if (f.size <= (video ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES)) return null;
  return `${f.name} is ${mb(f.size)}. ${video ? "Videos can be up to 50 MB." : "Photos can be up to 10 MB."}`;
}

/** A video over 3 minutes, as its length reads on the tile. */
export const lengthLine = (name: string, seconds: number): string | null =>
  Math.round(seconds) > MAX_VIDEO_SECONDS ? `${name} runs ${clock(seconds)}. Videos can be up to 3 minutes.` : null;

/** The files to store (the first 20 that pass, as many as the library has room for) and a line for each refusal. */
export function planUpload<F extends Picked>(files: F[], room: number): { take: F[]; lines: string[] } {
  const lines = files.length > MAX_AT_ONCE ? [PICK_LINE] : [];
  const ok: F[] = [];
  for (const f of files.slice(0, MAX_AT_ONCE)) {
    const why = fileLine(f);
    if (why) lines.push(why);
    else ok.push(f);
  }
  if (ok.length > room) lines.push(FULL_LINE);
  return { take: ok.slice(0, Math.max(0, room)), lines };
}

/** False when this site's storage on the device has no room for `bytes` more (unknown counts as room). */
async function roomOnDevice(bytes: number): Promise<boolean> {
  try {
    const e = await navigator.storage?.estimate?.();
    return !e?.quota || (e.usage ?? 0) + bytes * 1.1 < e.quota;
  } catch {
    return true;
  }
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A video kept as its own bytes with a still beside it, or the line refusing it; nothing is stored when refused. */
async function keepVideo(f: File): Promise<Pick<MediaItem, "key" | "kind" | "seconds" | "width" | "height"> | string> {
  const { loadVideo, stills } = await (videoMedia ??= import("@/lib/videoMedia"));
  const v = await loadVideo(f);
  const { duration: seconds, videoWidth: width, videoHeight: height } = v;
  URL.revokeObjectURL(v.src);
  if (!Number.isFinite(seconds) || !width || !height) throw new Error("This browser can't open that video. Try an MP4 or MOV.");
  const long = lengthLine(f.name, seconds);
  if (long) return long;
  const thumb = await (await fetch((await stills(f, [0.25], 240))[0])).blob();
  const id = newId();
  await putFile(`cvid-${id}`, f);
  try {
    await putFile(`cimg-${id}`, thumb);
  } catch (e) {
    await deleteFile(`cvid-${id}`).catch(() => undefined);
    throw e;
  }
  return { key: `cvid-${id}`, kind: "video", seconds: Math.round(seconds * 100) / 100, width, height };
}

/**
 * Checks, stores and adds the files to `uid`'s library, newest first, then queues their sort. `onProgress` gets
 * "file n of m" before each one is stored. Returns the keys added and every refusal line.
 */
export async function addFiles(
  uid: string,
  files: File[],
  o: { folder?: string; onProgress?: (n: number, of: number) => void } = {},
): Promise<{ added: string[]; lines: string[] }> {
  const { take, lines } = planUpload(files, mediaRoom(uid));
  const added: string[] = [];
  for (const [i, f] of take.entries()) {
    o.onProgress?.(i + 1, take.length);
    if (!(await roomOnDevice(f.size))) {
      lines.push(SPACE_LINE);
      break;
    }
    try {
      const kept = fileType(f)!.startsWith("video/") ? await keepVideo(f) : await storePicture(f).then((p) => ({ key: p.key, kind: "photo" as const, width: p.width, height: p.height }));
      if (typeof kept === "string") {
        lines.push(kept);
        continue;
      }
      addMedia(uid, { ...kept, name: f.name.replace(/\.[^.]+$/, "").slice(0, 80), folder: o.folder ?? "", alt: "", addedAt: new Date().toISOString(), bytes: f.size });
      if (!loadMedia(uid, { videos: true }).some((m) => m.key === kept.key)) {
        // the index wasn't written (the library filled up meanwhile, or this device's storage is full): take the file back off
        await Promise.all([kept.key, kept.key.replace(/^cvid-/, "cimg-")].map((k) => deleteFile(k).catch(() => undefined)));
        lines.push(mediaRoom(uid) ? SPACE_LINE : FULL_LINE);
        break;
      }
      added.push(kept.key);
    } catch (e) {
      if ((e as Error)?.name === "QuotaExceededError") {
        lines.push(SPACE_LINE);
        break;
      }
      lines.push((e as Error)?.message || `Couldn't add ${f.name}.`);
    }
  }
  sortMedia(uid, added);
  return { added, lines };
}
