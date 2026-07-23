// Deep-links an existing saved draft into Write, pre-filled to reformat it
// for a different platform/format. No new edge-function mode needed - like
// the existing "remix" links in topPosts.ts/trends.ts, this rides the same
// free-text ctx field the generator already reads.

import type { DraftEntry } from "@/lib/draftHistory";

export interface RepurposeTarget {
  key: string;
  platform: string;
  format: string;
  label: string;
}

export const REPURPOSE_TARGETS: RepurposeTarget[] = [
  { key: "li-text", platform: "linkedin", format: "text-post", label: "LinkedIn post" },
  { key: "li-carousel", platform: "linkedin", format: "carousel", label: "LinkedIn carousel" },
  { key: "ig-carousel", platform: "instagram", format: "carousel", label: "Instagram carousel" },
  { key: "ig-reel", platform: "instagram", format: "short-video", label: "Instagram Reel" },
  { key: "tiktok", platform: "tiktok", format: "short-video", label: "TikTok script" },
  { key: "fb-text", platform: "facebook", format: "text-post", label: "Facebook post" },
];

/** Targets worth offering for a given draft - excludes its current platform+format. */
export function repurposeTargetsFor(draft: DraftEntry): RepurposeTarget[] {
  return REPURPOSE_TARGETS.filter(
    (t) => !(t.platform === draft.platform && t.format === draft.format),
  );
}

export function buildRepurposeUrl(draft: DraftEntry, target: RepurposeTarget): string {
  const params = new URLSearchParams({
    pillar: draft.pillar,
    detail: draft.pillarDetail || draft.hook || draft.draft.slice(0, 80),
    audience: draft.audience,
    platform: target.platform,
    format: target.format,
    ctx: `Repurpose this existing post (originally written for ${draft.platform}) into a ${target.label}. Keep the core idea and message, but adapt the structure, pacing and length for the new platform/format - don't just paste the original in. Original post for reference: ${draft.draft.slice(0, 600)}`,
  });
  return `/generate?${params.toString()}`;
}
