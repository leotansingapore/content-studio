// Write brief templates: the choices of a brief that works (format, platform,
// audience, CTA, funnel stage, idea source, and the topic only when kept),
// saved per profile so the next post starts from them.

import { scoped } from "@/lib/profiles";

export const MAX_TEMPLATES = 20;

export interface BriefTemplate {
  id: string;
  name: string;
  createdAt: string;
  pillar: string;
  /** The topic, only when the user chose to keep it. */
  pillarDetail?: string;
  audience: string;
  singlish?: boolean;
  funnelStage: string | null;
  ideaSource: string;
  platform: string;
  format: string;
  ctaType: string;
}

const key = (userId: string) => `content-studio-templates-${scoped(userId)}`;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadTemplates(userId: string | null | undefined): BriefTemplate[] {
  const s = storage();
  if (!s || !userId) return [];
  try {
    const list = JSON.parse(s.getItem(key(userId)) ?? "[]");
    return Array.isArray(list) ? list.filter((t) => t && typeof t.name === "string") : [];
  } catch {
    return [];
  }
}

function write(userId: string, list: BriefTemplate[]): BriefTemplate[] {
  const kept = list.slice(0, MAX_TEMPLATES);
  storage()?.setItem(key(userId), JSON.stringify(kept));
  return kept;
}

/** Saves newest first; a template with the same name (any case) is replaced. */
export function saveTemplate(userId: string, t: Omit<BriefTemplate, "id" | "createdAt">): BriefTemplate[] {
  const entry: BriefTemplate = {
    ...t,
    name: t.name.trim(),
    id: `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  const others = loadTemplates(userId).filter((x) => x.name.toLowerCase() !== entry.name.toLowerCase());
  return write(userId, [entry, ...others]);
}

export function deleteTemplate(userId: string, id: string): BriefTemplate[] {
  return write(userId, loadTemplates(userId).filter((t) => t.id !== id));
}
