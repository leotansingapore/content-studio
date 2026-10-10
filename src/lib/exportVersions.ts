// Export in several sizes: one edit made as a reel, a feed post, a square and a
// wide video in one run (videoMedia's export queue). Each version is the same
// settings with only the shape (and its platform) changed, so the export frames
// it exactly as it frames a single export of that shape.

import { exportSize, type Aspect, type EditSettings, type ExportTarget } from "@/lib/videoEdit";

export interface ExportVersion {
  /** Also the end of the file's name. */
  id: string;
  label: string;
  aspect: Aspect;
  /** The platform it is sized for when it is not the shape the edit is in (unset = Instagram). */
  exportFor?: ExportTarget;
}

// TikTok's 72 MB cap is the tighter of the two vertical apps, so that file fits both
export const EXPORT_VERSIONS: ExportVersion[] = [
  { id: "reels-9x16", label: "Reels, TikTok 9:16", aspect: "9:16", exportFor: "tiktok" },
  { id: "feed-4x5", label: "Feed 4:5", aspect: "4:5" },
  { id: "square-1x1", label: "Square 1:1", aspect: "1:1" },
  { id: "youtube-16x9", label: "YouTube, LinkedIn 16:9", aspect: "16:9" },
];
const AS_FILMED: ExportVersion = { id: "original", label: "As filmed", aspect: "original" };

/** The versions on offer: none for a sound-only or WhatsApp export, As filmed first when the edit is in it. */
export function versionsFor(s: Pick<EditSettings, "aspect" | "exportAs">): ExportVersion[] {
  if ((s.exportAs ?? "video") !== "video") return [];
  return s.aspect === "original" ? [AS_FILMED, ...EXPORT_VERSIONS] : EXPORT_VERSIONS;
}

/** The version the edit is in now, ticked to start with. */
export function currentVersion(s: Pick<EditSettings, "aspect" | "exportAs">): string | null {
  return versionsFor(s).find((v) => v.aspect === s.aspect)?.id ?? null;
}

/** One version's settings. The edit's own shape keeps its platform too, so it is the file Export makes. */
export function versionSettings(s: EditSettings, v: ExportVersion): EditSettings {
  return v.aspect === s.aspect ? s : { ...s, aspect: v.aspect, exportFor: v.exportFor };
}

/** The file's name: the project's, cut so the version survives the 60 characters a download name keeps. */
export function versionName(name: string, v: ExportVersion): string {
  return `${name.trim().slice(0, 59 - v.id.length).trim()} ${v.id}`.trim();
}

/** Every version on offer with its settings, file name and expected size. */
export function versionPlan(s: EditSettings, name: string, seconds: number, srcW: number, srcH: number) {
  return versionsFor(s).map((v) => {
    const settings = versionSettings(s, v);
    return { ...v, settings, name: versionName(name, v), size: exportSize(settings, seconds, srcW, srcH) };
  });
}
export type VersionPlan = ReturnType<typeof versionPlan>[number];
