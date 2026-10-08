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

/**
 * Adds UTM tracking to every http(s) link in a post, so a website, booking
 * page or Google Analytics shows which platform and post sent the visit.
 * Existing query strings are kept and utm_ values already there win.
 */
export function tagLinks(text: string, tags: { source: string; campaign: string }): string {
  // the first five words of the hook or topic: readable in a report, never cut mid-word
  const campaign = (tags.campaign.toLowerCase().match(/[a-z0-9]+/g) ?? []).slice(0, 5).join("-") || "post";
  return text.replace(/\bhttps?:\/\/[^\s<>"')\]]+/gi, (raw) => {
    // a sentence's full stop or comma after a link isn't part of it
    const trail = raw.match(/[.,;:!?]+$/)?.[0] ?? "";
    const link = trail ? raw.slice(0, -trail.length) : raw;
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      return raw;
    }
    const add: [string, string][] = [["utm_source", tags.source.toLowerCase()], ["utm_medium", "social"], ["utm_campaign", campaign]];
    for (const [k, v] of add) if (!url.searchParams.has(k)) url.searchParams.set(k, v);
    return url.toString() + trail;
  });
}

// Stock AI words and the plain word each becomes, longest first so a phrase
// wins over its own last word. Ported from Jakeschincariol/linkedin-agent-skill
// (MIT) slop.json, trimmed: no entry that deletes words (it leaves broken
// sentences), and nothing that is a real term in a finance post (leverage as
// borrowing, comprehensive cover, holistic planning, journey, landscape).
const AI_WORDS: [string, string][] = [
  ["in the ever-evolving landscape of", "in"],
  ["in the ever-changing world of", "in"],
  ["in today's fast-paced world", "right now"],
  ["in today's digital age", "right now"],
  ["it is worth noting that", "note that"],
  ["imagine a world where", "imagine if"],
  ["had the opportunity to", "got to"],
  ["when it comes to", "with"],
  ["a wide range of", "many"],
  ["move the needle", "make a difference"],
  ["a testament to", "proof of"],
  ["testament to", "proof of"],
  ["treasure trove", "pile"],
  ["in order to", "to"],
  ["dive deep into", "get into"],
  ["delving into", "looking at"],
  ["delves into", "looks at"],
  ["delve into", "look at"],
  ["deep dive", "breakdown"],
  ["embark on", "start"],
  ["a plethora of", "lots of"],
  ["plethora of", "lots of"],
  ["a myriad of", "many"],
  ["myriad of", "many"],
  ["north star", "goal"],
  ["in essence", "basically"],
  ["in conclusion", "so"],
  ["game-changer", "big deal"],
  ["game-changing", "big"],
  ["cutting-edge", "new"],
  // a verb only when an object follows: "use leverage" stays a finance word
  ["leveraging(?=\\s+(?:your|our|my|their|the|this|these|those|it|them)\\b)", "using"],
  ["leverage(?=\\s+(?:your|our|my|their|the|this|these|those|it|them)\\b)", "use"],
  ["delving", "looking"],
  ["delves", "looks"],
  ["delve", "look"],
  ["utilizing", "using"],
  ["utilising", "using"],
  ["utilized", "used"],
  ["utilised", "used"],
  ["utilize", "use"],
  ["utilise", "use"],
  ["harness", "use"],
  ["foster", "build"],
  ["facilitate", "help"],
  ["showcase", "show"],
  ["unlock", "get"],
  ["elevate", "improve"],
  ["streamline", "simplify"],
  ["spearhead", "lead"],
  ["underscores", "shows"],
  ["underscore", "show"],
  ["cultivate", "build"],
  ["amplify", "boost"],
  ["curated", "picked"],
  ["curate", "pick"],
  ["empower", "help"],
  ["revolutionize", "change"],
  ["revolutionise", "change"],
  ["transformative", "big"],
  ["robust", "solid"],
  ["seamlessly", "smoothly"],
  ["seamless", "smooth"],
  ["pivotal", "key"],
  ["crucial", "important"],
  ["vital", "important"],
  ["groundbreaking", "new"],
  ["unparalleled", "unmatched"],
  ["invaluable", "useful"],
  ["meticulously", "carefully"],
  ["meticulous", "careful"],
  ["myriad", "many"],
  ["multifaceted", "complicated"],
  ["bespoke", "custom"],
  ["innovative", "new"],
  ["profound", "big"],
  ["remarkable", "notable"],
  ["compelling", "convincing"],
  ["tapestry", "mix"],
  ["realm", "world"],
  ["cornerstone", "base"],
  ["paradigm", "model"],
  ["ecosystem", "system"],
  ["moreover", "also"],
  ["furthermore", "also"],
  ["additionally", "also"],
  ["nevertheless", "still"],
  ["consequently", "so"],
  ["thus", "so"],
  ["hence", "so"],
  ["ultimately", "in the end"],
];
const AI_WORD_RES = AI_WORDS.map(([find, plain]) => [new RegExp(`\\b${find.replace(/ /g, "\\s+")}\\b`, "gi"), plain] as const);

// Links, emails, hashtags and handles are never rewritten.
const PROTECTED = /(https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+|[#@][\p{L}\p{N}_]+)/u;
// Format characters (zero-width spaces, joiners, soft hyphens, BOMs, tag
// characters) never come from a keyboard. A subdivision flag keeps its tags.
// ponytail: emoji test is per code point, a full emoji-sequence parser if a real one breaks
const INVISIBLE = /(\u{1F3F4}[\u{E0020}-\u{E007F}]+)|\p{Cf}/gu;
const EMOJI_BEFORE = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F/u;
const EMOJI_AFTER = /\p{Extended_Pictographic}/u;

function matchCase(found: string, plain: string): string {
  if (found.length > 1 && found === found.toUpperCase()) return plain.toUpperCase();
  return /^[A-Z]/.test(found) ? plain[0].toUpperCase() + plain.slice(1) : plain;
}

/**
 * One-tap clean of AI fingerprints: hidden characters out (the joiner inside
 * an emoji stays), odd spaces, curly quotes, dashes and the ellipsis character
 * made plain, stock AI words swapped from a fixed list. A transform, not a
 * judgment: it counts what it changed and decides nothing.
 */
export function cleanAiTells(input: string): { text: string; changes: number } {
  const { text, changes } = scanAiTells(input);
  return { text, changes };
}

/**
 * The clean, with what it found by kind: typography (hidden characters, odd
 * spaces, curly quotes, dashes, the ellipsis character) and the stock words it
 * swapped, lower case. Counts for the sounds-human check.
 */
export function scanAiTells(input: string): { text: string; changes: number; typography: number; words: string[] } {
  let changes = 0;
  const words: string[] = [];
  const count = (re: RegExp, s: string) => (changes += s.match(re)?.length ?? 0);

  let text = input.replace(INVISIBLE, (m, flag: string | undefined, off: number, s: string) => {
    if (flag) return flag;
    if (m === "\u200D") {
      const before = Array.from(s.slice(Math.max(0, off - 2), off)).pop() ?? "";
      const after = String.fromCodePoint(s.codePointAt(off + 1) ?? 32);
      if (EMOJI_BEFORE.test(before) && EMOJI_AFTER.test(after)) return m;
    }
    changes++;
    return "";
  });

  const PLAIN: [RegExp, string][] = [
    [/[\u00A0\u202F\u2009\u2007\u2003\u2002]/g, " "],
    [/[\u2018\u2019]/g, "'"],
    [/[\u201C\u201D]/g, '"'],
    [/\u2026/g, "..."],
  ];
  for (const [re, plain] of PLAIN) {
    count(re, text);
    text = text.replace(re, plain);
  }
  count(/[\u2014\u2013]/g, text);
  text = stripDashes(text);
  const typography = changes;

  text = text
    .split(PROTECTED)
    .map((part, i) => {
      if (i % 2) return part;
      for (const [re, plain] of AI_WORD_RES) {
        part = part.replace(re, (found) => {
          changes++;
          words.push(found.toLowerCase().replace(/\s+/g, " "));
          return matchCase(found, plain);
        });
      }
      return part;
    })
    .join("");

  return { text, changes, typography, words };
}
