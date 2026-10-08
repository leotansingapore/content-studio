// Content labels: the user's own tags for posts ("CPF", "Recruitment",
// "Behind the scenes"), per profile and synced. A post carries label ids in
// DraftEntry.labels. Until the user saves any, the list comes from their
// positioning topics, with ids made from the names so two devices agree. It is
// only written on a user action, so a device that has not pulled yet never
// pushes the seed over labels made elsewhere.
//   key: content-studio-labels-${scoped(userId)}

import { scoped } from "@/lib/profiles";
import { loadPositioning } from "@/lib/positioning";
import { draftStatus, loadDrafts, saveDrafts, type DraftEntry } from "@/lib/draftHistory";

export const LABEL_COLORS = ["primary", "brand", "success", "warning", "muted", "destructive"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

export interface Label {
  id: string;
  name: string;
  color: LabelColor;
  /** Target share of posts, as a weight (shown as %); equal shares when unset. */
  target?: number;
}

// Whole class strings so Tailwind keeps them.
export const LABEL_CHIP: Record<LabelColor, string> = {
  primary: "border-primary/40 bg-primary/10 text-primary",
  brand: "border-brand/40 bg-brand/10 text-brand",
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  muted: "border-border bg-muted text-muted-foreground",
  destructive: "border-destructive/40 bg-destructive/10 text-destructive",
};
export const LABEL_SWATCH: Record<LabelColor, string> = {
  primary: "bg-primary",
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  muted: "bg-muted-foreground",
  destructive: "bg-destructive",
};

export const LABEL_COLOR_NAME: Record<LabelColor, string> = {
  primary: "Blue",
  brand: "Purple",
  success: "Green",
  warning: "Orange",
  muted: "Grey",
  destructive: "Red",
};

export const MAX_LABELS = 12;
const NAME_MAX = 30;
const KEY_PREFIX = "content-studio-labels-";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "label";

/** Starter labels from positioning topics: one per topic, colours in order. */
export function seedLabels(topics: string[]): Label[] {
  const out: Label[] = [];
  for (const t of topics.map((x) => x.trim()).filter(Boolean)) {
    const id = `t-${slug(t)}`;
    if (out.length >= 6 || out.some((l) => l.id === id)) continue;
    out.push({ id, name: t.slice(0, NAME_MAX), color: LABEL_COLORS[out.length % LABEL_COLORS.length] });
  }
  return out;
}

export function loadLabels(userId: string | null | undefined): Label[] {
  const s = storage();
  if (!userId || !s) return [];
  const raw = s.getItem(KEY_PREFIX + scoped(userId));
  if (raw === null) return seedLabels(loadPositioning(userId)?.topics ?? []);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((l): l is Label => l && typeof l.id === "string" && typeof l.name === "string").map((l) => ({
          ...l,
          color: LABEL_COLORS.includes(l.color) ? l.color : "muted",
        }))
      : [];
  } catch {
    return [];
  }
}

export function saveLabels(userId: string, labels: Label[]): Label[] {
  storage()?.setItem(KEY_PREFIX + scoped(userId), JSON.stringify(labels));
  return labels;
}

/** The colour the next new label gets: the first one not in use yet. */
export function nextColor(labels: Label[]): LabelColor {
  return LABEL_COLORS.find((c) => !labels.some((l) => l.color === c)) ?? LABEL_COLORS[labels.length % LABEL_COLORS.length];
}

/** Adds a label; null when the name is empty, taken, or the list is full. */
export function addLabel(userId: string, name: string, color?: LabelColor): { labels: Label[]; label: Label } | null {
  const clean = name.trim().slice(0, NAME_MAX);
  const labels = loadLabels(userId);
  if (!clean || labels.length >= MAX_LABELS || labels.some((l) => l.name.toLowerCase() === clean.toLowerCase())) return null;
  const label: Label = { id: `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: clean, color: color ?? nextColor(labels) };
  return { labels: saveLabels(userId, [...labels, label]), label };
}

/** Renames, recolours or retargets a label. A blank or taken name is ignored. */
export function updateLabel(userId: string, id: string, patch: Partial<Omit<Label, "id">>): Label[] {
  const labels = loadLabels(userId);
  const name = patch.name?.trim().slice(0, NAME_MAX);
  const clash = name !== undefined && (!name || labels.some((l) => l.id !== id && l.name.toLowerCase() === name.toLowerCase()));
  return saveLabels(
    userId,
    labels.map((l) => (l.id === id ? { ...l, ...patch, name: clash || name === undefined ? l.name : name } : l)),
  );
}

/** Deletes a label and takes it off every post that had it. */
export function deleteLabel(userId: string, id: string): { labels: Label[]; drafts: DraftEntry[] } {
  const labels = saveLabels(userId, loadLabels(userId).filter((l) => l.id !== id));
  const drafts = loadDrafts(userId).map((d) => (d.labels?.includes(id) ? withLabels(d, d.labels.filter((x) => x !== id)) : d));
  saveDrafts(userId, drafts);
  return { labels, drafts };
}

/** A copy of the post with these label ids; no empty array is stored. */
export function withLabels(d: DraftEntry, ids: string[]): DraftEntry {
  const next: DraftEntry = { ...d, labels: [...new Set(ids)] };
  if (!next.labels!.length) delete next.labels;
  return next;
}

/** Sets a post's labels. */
export function setDraftLabels(userId: string, id: string, ids: string[]): DraftEntry[] {
  // A seeded label is about to be used: pin the list so a topic edit can't drop it.
  if (storage()?.getItem(KEY_PREFIX + scoped(userId)) === null) saveLabels(userId, loadLabels(userId));
  const drafts = loadDrafts(userId).map((d) => (d.id === id ? withLabels(d, ids) : d));
  saveDrafts(userId, drafts);
  return drafts;
}

export interface MixRow {
  label: Label;
  count: number;
  /** % of all label uses in the window. */
  share: number;
  /** Target %, from the label weights (equal by default). */
  target: number;
}

/** Posts per label among the posts that went out in the last `days` (0 = all time), against each label's target share. */
export function labelMix(posts: DraftEntry[], labels: Label[], days: number, now = Date.now()) {
  const from = days ? now - days * 86_400_000 : -Infinity;
  const inWindow = posts.filter((p) => {
    if (draftStatus(p) !== "posted" || !p.postedAt) return false;
    const t = new Date(p.postedAt).getTime();
    return t > from && t <= now;
  });
  const known = new Set(labels.map((l) => l.id));
  const counts = new Map(labels.map((l) => [l.id, 0]));
  let unlabelled = 0;
  for (const p of inWindow) {
    const ids = (p.labels ?? []).filter((id) => known.has(id));
    if (!ids.length) unlabelled++;
    for (const id of ids) counts.set(id, counts.get(id)! + 1);
  }
  const uses = [...counts.values()].reduce((a, b) => a + b, 0);
  const weights = labels.map((l) => (l.target !== undefined && l.target >= 0 ? l.target : 100 / labels.length));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const rows: MixRow[] = labels.map((label, i) => ({
    label,
    count: counts.get(label.id)!,
    share: uses ? Math.round((counts.get(label.id)! / uses) * 100) : 0,
    target: weightSum ? Math.round((weights[i] / weightSum) * 100) : 0,
  }));
  return { rows, posts: inWindow.length, unlabelled };
}
