// Post it for me (My posts, Calendar, Write): a dated draft scheduled through Zernio on the adviser's own
// connected accounts, by the `social` function (supabase/functions/social/posts.ts, which checks every id
// and every field again). Media goes from the browser straight to Zernio's storage: `presign` hands out a
// one-hour PUT link per file, the file is PUT there with progress, and the post carries its public link.
// If that storage ever refuses a browser PUT (CORS), see docs/zernio-connection.md for the fallback.

import { callFn } from "@/lib/edgeFn";
import type { ZernioLink } from "@/lib/draftHistory";
import {
  MAX_IMAGE_BYTES,
  MAX_PICTURES,
  MAX_VIDEO_BYTES,
  MEDIA_TYPES,
  type CreatorInfo,
  type PostView,
} from "../../supabase/functions/social/posts.ts";

export { MAX_PICTURES, type CreatorInfo, type PostView };

/** A file the adviser picked or the app rendered, before it is uploaded. */
export interface MediaFile {
  file: Blob;
  name: string;
  type: string;
}

/** The upload type for a file: its own type when Zernio takes it, else read from its name; null when it can't go. */
export function fileType(f: { name: string; type: string }): string | null {
  if (MEDIA_TYPES[f.type]) return f.type;
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  return Object.keys(MEDIA_TYPES).find((t) => MEDIA_TYPES[t].includes(ext)) ?? null;
}

/** Why this file can't go, or null. The same caps the server checks. */
export function fileProblem(f: { name: string; type: string; size: number }): string | null {
  const type = fileType(f);
  if (!type) return `${f.name} isn't a JPG, PNG or WebP picture, or an MP4 or MOV video.`;
  const video = type.startsWith("video/");
  if (f.size > (video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) return `${f.name} is over ${video ? "300" : "8"} MB.`;
  return null;
}

/** A plain name the presign takes: letters, numbers and dashes, numbered, with the type's own ending. */
export function uploadName(name: string, type: string, index: number): string {
  const base =
    name
      .replace(/\.[^.]*$/, "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "media";
  return `${base}-${index + 1}.${MEDIA_TYPES[type][0]}`;
}

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

/** PUTs one file to a presigned link, reporting bytes sent. A refused or blocked PUT (status 0) rejects in plain words. */
export function putFile(url: string, file: Blob, type: string, onProgress?: (sent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", type);
    xhr.upload.onprogress = (e) => onProgress?.(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new UploadError(`The upload was refused (${xhr.status}). Try again.`)));
    xhr.onerror = () => reject(new UploadError("The upload didn't go through. Check your connection and try again."));
    xhr.ontimeout = xhr.onerror;
    xhr.send(file);
  });
}

export const presignUpload = (profileId: string, filename: string, contentType: string, size: number) =>
  callFn<{ uploadUrl: string; publicUrl: string }>("social", { action: "presign", profileId, filename, contentType, size }, "Couldn't start the upload. Try again in a minute.");

/**
 * Uploads every file not already in `done` (file -> its public link), in order, and returns the links.
 * A failure keeps what went up in `done`, so trying again sends only the rest.
 */
export async function uploadAll(profileId: string, files: MediaFile[], done: Map<Blob, string>, onProgress: (percent: number) => void): Promise<string[]> {
  const total = files.reduce((n, f) => n + f.file.size, 0) || 1;
  let before = files.filter((f) => done.has(f.file)).reduce((n, f) => n + f.file.size, 0);
  onProgress(Math.round((before / total) * 100));
  for (const [i, f] of files.entries()) {
    if (done.has(f.file)) continue;
    const { uploadUrl, publicUrl } = await presignUpload(profileId, uploadName(f.name, f.type, i), f.type, f.file.size);
    await putFile(uploadUrl, f.file, f.type, (sent) => onProgress(Math.min(99, Math.round(((before + sent) / total) * 100))));
    done.set(f.file, publicUrl);
    before += f.file.size;
    onProgress(Math.round((before / total) * 100));
  }
  return files.map((f) => done.get(f.file)!);
}

/** The draft's link from what Zernio says about its post: status, time, each live post's link and the first reason it failed. */
export function linkFromView(key: string, v: PostView): ZernioLink {
  const links = v.platforms.filter((p) => p.url && /^https:\/\//.test(p.url)).map((p) => ({ platform: p.platform, url: p.url! }));
  const error = v.platforms.find((p) => p.error)?.error;
  return { key, postId: v.id, status: v.status, ...(v.scheduledFor ? { at: v.scheduledFor } : {}), ...(links.length ? { links } : {}), ...(error ? { error } : {}) };
}
