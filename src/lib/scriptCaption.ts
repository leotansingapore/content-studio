// Short-video drafts come back from the generator as a spoken script
// (HOOK / BODY / CTA) followed by a suggested caption under a heading like
// "**CAPTION:**" or "Suggested caption:". Only the caption is what actually
// gets posted, so previews need the two halves separated.

const CAPTION_HEADING =
  /^[\s>#*-]*(?:suggested\s+)?caption\s*\**\s*(?::\s*\**\s*(.*))?$/i;

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
