// What each phase 3 format job is doing, for /library's Making now (phase 3 decision 8). Each format's job runs
// outside React in its own module and mirrors its visible step here, so a new format never edits library.ts or
// MakingNow.tsx. One job per slug, in memory: a reload forgets it, and paid clips resume from their own store.

import type { LibraryFormat } from "@/lib/library";

export interface FormatJob {
  slug: string;
  label: string;
  format: LibraryFormat;
  state: "working" | "failed" | "ready";
  step?: string;
  error?: string;
  href: string;
}

const jobs = new Map<string, FormatJob>();
const listeners = new Set<(list: FormatJob[]) => void>();
const emit = () => {
  const list = formatJobs();
  listeners.forEach((l) => l(list));
};

/** Sets the slug's job, replacing the one before; the same job again tells nobody. */
export function setFormatJob(j: FormatJob): void {
  const prev = jobs.get(j.slug);
  if (prev && JSON.stringify(prev) === JSON.stringify(j)) return;
  jobs.set(j.slug, { ...j });
  emit();
}

export function clearFormatJob(slug: string): void {
  if (jobs.delete(slug)) emit();
}

export const formatJobs = (): FormatJob[] => [...jobs.values()];

export function onFormatJob(cb: (list: FormatJob[]) => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}
