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
