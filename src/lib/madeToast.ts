// "Your <format> is ready": which background makes finished between two looks at the jobs /library's Making now
// lists (useLibraryJobs), so the shell can say so on whatever page is open (Leo, 11 Nov: "there should be a pop up
// here whenever something has been created already"). Read-only over the job modules: no job changes.

import type { LibraryJob } from "@/lib/library";

/** Kinds whose row leaves the list when made (a made slideshow is saved, a picture is in Media). */
const LEAVES_MADE = new Set(["slideshow", "image"]);

/**
 * The jobs that ended made: a row that turned ready (a video waiting for the editor, a static ad, a Blitz deck), or a
 * slideshow or picture that left the list while working. A video job's own row says nothing: its join's ready row
 * does, once. Remixes and exports have their own pills, and the slideshows a Blitz deck makes are its cards.
 */
export function madeBetween(before: LibraryJob[], after: LibraryJob[]): LibraryJob[] {
  const was = new Map(before.map((j) => [j.kind, j]));
  const now = new Set(after.map((j) => j.kind));
  const deck = [...before, ...after].some((j) => j.kind === "format-blitz" && j.state === "working");
  const ready = after.filter((j) => j.state === "ready" && was.get(j.kind)?.state !== "ready");
  const left = before.filter((j) => j.state === "working" && !j.waiting && !now.has(j.kind) && LEAVES_MADE.has(j.kind) && !(deck && j.kind === "slideshow"));
  return [...ready, ...left];
}

/** "Your wall of text is ready": the row's label, its first letter lowered. */
export const readyTitle = (label: string) => `Your ${label.charAt(0).toLowerCase()}${label.slice(1)} is ready`;

/** The path a job's row links to, without its query. */
export const pathOf = (href: string) => href.split(/[?#]/)[0];
