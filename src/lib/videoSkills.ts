// Video editing skills: each adviser edits differently, so their ways of editing
// are saved by name and reused in one tap. A skill is a look (videoEdit.ts lookOf:
// captions, cuts, shape, brand touches) plus, optionally, instructions in plain
// words that the vibe editor runs on each new video, for the parts that depend on
// what is said ("hook: the most surprising number I mention").
//   key: content-studio-videoskills-${scoped(userId)}
// It replaces the single saved look (content-studio-videolook-), which is read as
// a skill called "My look" until the first save writes the list.

import { scoped } from "@/lib/profiles";
import { loadLook } from "@/lib/videoProjects";

export interface VideoSkill {
  id: string;
  name: string;
  look: Record<string, unknown>;
  /** Plain-words instructions the vibe editor runs when the skill is applied. */
  prompt?: string;
  /** New videos start with this skill. */
  isDefault?: boolean;
  updatedAt: string;
}

export const MAX_SKILLS = 12;
const KEY = "content-studio-videoskills-";

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function clean(raw: unknown): VideoSkill | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.name !== "string" || !r.name.trim() || !r.look || typeof r.look !== "object" || Array.isArray(r.look)) return null;
  const prompt = typeof r.prompt === "string" ? r.prompt.trim().slice(0, 500) : "";
  return {
    id: r.id.slice(0, 40),
    name: r.name.trim().slice(0, 40),
    look: r.look as Record<string, unknown>,
    ...(prompt ? { prompt } : {}),
    ...(r.isDefault === true ? { isDefault: true } : {}),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : "",
  };
}

export function loadSkills(userId: string | null | undefined): VideoSkill[] {
  const s = store();
  if (!s || !userId) return [];
  const raw = s.getItem(KEY + scoped(userId));
  if (raw === null) {
    // not saved yet: the old single look shows as a skill, written on the first save
    const look = loadLook(userId);
    return look ? [{ id: "my-look", name: "My look", look, isDefault: true, updatedAt: "" }] : [];
  }
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(clean).filter((x): x is VideoSkill => !!x).slice(0, MAX_SKILLS) : [];
  } catch {
    return [];
  }
}

function write(userId: string, list: VideoSkill[]): VideoSkill[] {
  const next = list.slice(0, MAX_SKILLS);
  try {
    store()?.setItem(KEY + scoped(userId), JSON.stringify(next));
  } catch {
    // storage full: the list still applies for this visit
  }
  return next;
}

/** Adds or replaces a skill (by id); a skill made the default takes that from any other. */
export function saveSkill(userId: string, skill: Omit<VideoSkill, "updatedAt">, now = new Date()): VideoSkill[] {
  const saved = clean({ ...skill, updatedAt: now.toISOString() });
  if (!saved) return loadSkills(userId);
  const rest = loadSkills(userId)
    .filter((x) => x.id !== saved.id)
    .map((x) => (saved.isDefault && x.isDefault ? { ...x, isDefault: undefined } : x))
    .map((x) => clean(x)!)
  ;
  return write(userId, [saved, ...rest]);
}

export function removeSkill(userId: string, id: string): VideoSkill[] {
  return write(userId, loadSkills(userId).filter((x) => x.id !== id));
}

export const defaultSkill = (list: VideoSkill[]) => list.find((x) => x.isDefault) ?? null;

export function newSkillId(): string {
  return `skill-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** A name for a new skill from what was asked of the vibe editor, else a numbered default. */
export function suggestName(asks: string[], existing: VideoSkill[]): string {
  const words = (asks[asks.length - 1] ?? "").replace(/[^\w\s]/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
  if (words) return (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 40);
  let n = existing.length + 1;
  while (existing.some((x) => x.name === `My style ${n}`)) n++;
  return `My style ${n}`;
}
