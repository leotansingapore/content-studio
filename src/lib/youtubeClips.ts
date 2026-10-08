// YouTube link to clips (Edit a video > From a YouTube link): the youtube-captions
// edge function reads the video's captions (never the video), the editor's clip
// finder picks the moments, and each clip opens on YouTube at its start or goes
// to Write. The job lives outside React, so it carries on while the adviser
// moves to another page; the last result is kept per profile.

import { callFn } from "@/lib/edgeFn";
import { findClips } from "@/lib/videoProjects";
import { scoped } from "@/lib/profiles";
import type { Clip, Sentence } from "@/lib/videoEdit";

export interface YoutubeClip extends Clip {
  /** What is said in the clip, from the captions. */
  text: string;
}

export interface YoutubeClips {
  url: string;
  videoId: string;
  title: string;
  clips: YoutubeClip[];
  at: string;
}

export type YoutubeJob =
  | { state: "captions" | "clips"; url: string }
  | { state: "done"; url: string; result: YoutubeClips }
  | { state: "failed"; url: string; error: string };

const KEY = "content-studio-ytclips-";

export function loadYoutubeClips(userId: string): YoutubeClips | null {
  try {
    const r = JSON.parse(localStorage.getItem(KEY + scoped(userId)) ?? "null");
    return r && Array.isArray(r.clips) && typeof r.videoId === "string" ? r : null;
  } catch {
    return null;
  }
}

/** The words of the sentences inside a clip. */
export function clipText(sentences: Sentence[], clip: Clip): string {
  return sentences
    .filter((x) => x.s >= clip.start - 0.05 && x.e <= clip.end + 0.05)
    .map((x) => x.text)
    .join(" ")
    .slice(0, 1500);
}

export const watchUrl = (videoId: string, start: number) => `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(start)}s`;

/** Write's brief for a clip: what was said, where it came from, credit if it isn't theirs. */
export function clipWriteUrl(r: Pick<YoutubeClips, "videoId" | "title">, clip: YoutubeClip): string {
  const ctx = [
    `Write a post from this part of a YouTube video${r.title ? `, "${r.title}"` : ""} (${watchUrl(r.videoId, clip.start)}).`,
    `What's said: "${clip.text}"`,
    "If it isn't my own video, credit the speaker and link the video.",
  ].join("\n");
  return `/generate?${new URLSearchParams({ pillar: "topic", detail: clip.title, ctx }).toString()}`;
}

let job: YoutubeJob | null = null;
const listeners = new Set<(j: YoutubeJob | null) => void>();
const set = (j: YoutubeJob) => {
  job = j;
  listeners.forEach((l) => l(j));
};
export const youtubeJob = () => job;
export function onYoutubeJob(fn: (j: YoutubeJob | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const youtubeBusy = () => job?.state === "captions" || job?.state === "clips";

export async function findYoutubeClips(userId: string, url: string): Promise<void> {
  if (youtubeBusy()) return;
  set({ state: "captions", url });
  try {
    const cap = await callFn<{ videoId: string; title: string; duration: number; sentences: Sentence[] }>(
      "youtube-captions", { url }, "Couldn't read that video's captions right now. Try again in a minute.");
    set({ state: "clips", url });
    const found = await findClips(cap.sentences, cap.duration);
    const result: YoutubeClips = {
      url, videoId: cap.videoId, title: cap.title, at: new Date().toISOString(),
      clips: found.map((c) => ({ ...c, text: clipText(cap.sentences, c) })),
    };
    try {
      localStorage.setItem(KEY + scoped(userId), JSON.stringify(result));
    } catch { /* full storage: the result still shows until the page reloads */ }
    set({ state: "done", url, result });
  } catch (e) {
    set({ state: "failed", url, error: (e as Error).message });
  }
}
