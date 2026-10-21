// Short-video drafts come back from the generator as a spoken script
// (HOOK / BODY / CTA) followed by a suggested caption under a heading like
// "**CAPTION:**" or "Suggested caption:". Only the caption is what actually
// gets posted, so previews need the two halves separated.

import type { DraftEntry } from "@/lib/draftHistory";

// Also "SUGGESTED POST CAPTION:" / "Post caption:" and "[CAPTION SUGGESTION]", which the generator writes too.
const CAPTION_HEADING =
  /^[\s>#*[-]*(?:suggested\s+)?(?:post\s+)?caption(?:\s+suggestions?)?\s*[\]*]*\s*(?::\s*\**\s*(.*))?$/i;

export function splitScriptCaption(text: string): {
  script: string | null;
  caption: string;
} {
  const trimmed = text.trim();
  if (!trimmed) return { script: null, caption: "" };

  const lines = trimmed.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(CAPTION_HEADING);
    if (!m) continue;

    const inline = m[1]?.trim() ?? "";
    const after = lines.slice(i + 1).join("\n").trim();
    const caption = [inline, after].filter(Boolean).join("\n").trim();

    // Drop a trailing "---" style separator left above the heading.
    const script = lines
      .slice(0, i)
      .join("\n")
      .replace(/\n[\s*_-]{3,}\s*$/, "")
      .trim();

    return { script: script || null, caption };
  }

  return { script: null, caption: trimmed };
}

/**
 * A post with a video's caption in place of its own, in Clone a reel's shape (script, a --- line, CAPTION:), so
 * splitScriptCaption still splits it: the script half and every other field kept. Text with no caption heading is
 * all script here, the way the video was spoken from it, so no words are lost.
 */
export function withVideoCaption(entry: DraftEntry, caption: string): DraftEntry {
  const old = entry.draft.trim();
  const split = splitScriptCaption(old);
  // no heading gives the whole text back as the caption; a heading with nothing above it has no script
  const script = split.script ?? (split.caption === old ? old : "");
  return { ...entry, draft: `${script ? `${script}\n\n---\n\n` : ""}CAPTION:\n${caption.trim()}` };
}
