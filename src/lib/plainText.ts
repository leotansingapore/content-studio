// Strip markdown formatting from generated drafts before they leave the app.
//
// The generator is prompt-driven and routinely emits markdown - bold headings,
// "**CAPTION:**" markers (see scriptCaption.ts), bullet lists. No social
// platform renders any of it: LinkedIn, Instagram, TikTok and Facebook all
// paste "**this**" as literal asterisks. So we clean at the moment text leaves
// for a platform (copy / share), NOT on save - the stored draft keeps whatever
// the model produced so re-editing and the caption split still work.
//
// Deliberately conservative: preserves line breaks and paragraph spacing, which
// carry the visual rhythm of a social post.

/** Markdown bullet markers -> a bullet social platforms render natively. */
const BULLET = "•";

export function toPlainText(input: string): string {
  if (!input) return "";
  let out = input;

  // Fenced code blocks: drop the fence lines, keep the contents.
  out = out.replace(/^[ \t]*```[^\n]*\n?/gm, "");

  // Links + images: [text](url) -> text (url); ![alt](url) -> alt
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text: string, url: string) =>
    text.trim() === url.trim() ? url : `${text} (${url})`,
  );

  // Inline emphasis. Bold before italic so ** isn't consumed as two italics.
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, "$1");
  out = out.replace(/__([^_\n]+?)__/g, "$1");
  // Italic *text*: require a non-space first char so "* item" bullets survive
  // to the line-level pass below.
  out = out.replace(/\*([^\s*][^*\n]*?)\*/g, "$1");
  // Italic _text_: guard against snake_case by requiring a boundary either side.
  // (Capture the leading char rather than using lookbehind - Safari <16.4
  // throws a syntax error on lookbehind, which would break the whole module.)
  out = out.replace(/(^|[^A-Za-z0-9_])_([^_\n]+?)_(?![A-Za-z0-9])/g, "$1$2");

  out = out.replace(/~~([^~\n]+?)~~/g, "$1");
  out = out.replace(/`([^`\n]+?)`/g, "$1");

  out = out
    .split("\n")
    .map((line) => {
      let l = line;
      // Horizontal rules -> drop entirely.
      if (/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(l)) return "";
      // ATX headings: "## Text" -> "Text"
      l = l.replace(/^[ \t]*#{1,6}[ \t]+/, "");
      // Blockquotes: "> Text" -> "Text"
      l = l.replace(/^[ \t]*>[ \t]?/, "");
      // Unordered bullets -> a real bullet char, preserving indentation.
      l = l.replace(/^([ \t]*)[-*+][ \t]+/, `$1${BULLET} `);
      return l.replace(/[ \t]+$/, "");
    })
    .join("\n");

  // Collapse runs of 3+ blank lines left by dropped rules/fences down to one
  // blank line, so paragraph spacing stays intact without big holes.
  out = out.replace(/\n{3,}/g, "\n\n");

  return out.trim();
}

const HASHTAG = /#[\p{L}\p{N}_]+/gu;

/**
 * The brand kit sign-off on the end of a post, once. Hashtags the post already
 * has are left out of the sign-off, and a line left empty by that is dropped,
 * so a draft ending in #cpf doesn't paste with #cpf twice.
 */
export function withSignOff(text: string, signOff: string | null | undefined): string {
  const body = text.trimEnd();
  const tail = (signOff ?? "").trim();
  if (!tail || body.endsWith(tail)) return tail ? body : text;
  const have = new Set((body.match(HASHTAG) ?? []).map((t) => t.toLowerCase()));
  const lines = tail.split("\n").flatMap((line) => {
    if (!/#[\p{L}\p{N}_]/u.test(line)) return [line];
    const left = line.replace(HASHTAG, (t) => (have.has(t.toLowerCase()) ? "" : t)).replace(/[ \t]{2,}/g, " ").trim();
    return left ? [left] : [];
  });
  const kept = lines.join("\n").trim();
  return kept ? `${body}\n\n${kept}` : body;
}

// Disclosure labels a post can carry, in the order they are written.
export const DISCLOSURES = {
  ai: { label: "AI-assisted", line: "Written with AI assistance." },
  paid: { label: "Paid partnership", line: "Paid partnership." },
  sponsored: { label: "Sponsored", line: "Sponsored." },
} as const;
export type DisclosureId = keyof typeof DISCLOSURES;

/** The chosen disclosures as one short closing line, added once. */
export function withDisclosure(text: string, ids: readonly DisclosureId[]): string {
  const line = (Object.keys(DISCLOSURES) as DisclosureId[])
    .filter((id) => ids.includes(id))
    .map((id) => DISCLOSURES[id].line)
    .join(" ");
  if (!line) return text;
  const body = text.trimEnd();
  if (body.endsWith(line)) return body;
  return body ? `${body}\n\n${line}` : line;
}

// Em and en dashes read as AI. A range between numbers keeps a hyphen, a dash
// opening a line goes, and any other becomes a comma; line breaks stay.
export const stripDashes = (t: string) =>
  t
    .replace(/(\d)[ \t]*[—–][ \t]*(?=\$?\d)/g, "$1-")
    .replace(/^[ \t]*[—–][ \t]*/gm, "")
    .replace(/[ \t]*[—–][ \t]*/g, ", ")
    .replace(/,[ \t]*,/g, ",")
    .replace(/, (?=\n|$)/g, ",");
