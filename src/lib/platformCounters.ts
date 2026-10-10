// Word + character counter logic per platform.
//
// LinkedIn: 100-180 words ideal; over 250 = warn
// Instagram: 80-150 words ideal for caption (chars < 1000 ideal, hard cap 2200);
//   first 138 chars are critical (before the "more" truncation).
// Facebook: 40-80 words ideal; over 150 = warn
// TikTok caption: 80-150 chars; cap 2200

export type PlatformId = "linkedin" | "instagram" | "facebook" | "tiktok";

export interface CounterReadout {
  words: number;
  chars: number;
  status: "good" | "warn" | "over";
  message: string;
  firstNote?: string;
  unit: "words" | "chars";
}

export function countWords(text: string): number {
  if (!text) return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

export function countChars(text: string): number {
  if (!text) return 0;
  return text.length;
}

export function readout(text: string, platform: PlatformId): CounterReadout {
  const words = countWords(text);
  const chars = countChars(text);

  if (platform === "linkedin") {
    let status: CounterReadout["status"] = "good";
    let message = "On the LinkedIn sweet spot (100-180 words).";
    if (words === 0) {
      status = "warn";
      message = "Add more body. LinkedIn ideal: 100-180 words.";
    } else if (words < 100) {
      status = "warn";
      message = `Short for LinkedIn. Aim for 100-180 words.`;
    } else if (words > 250) {
      status = "over";
      message = "Long for LinkedIn (over 250 words). Trim 30%.";
    } else if (words > 180) {
      status = "warn";
      message = "A touch long for LinkedIn. Sweet spot 100-180 words.";
    }
    return { words, chars, status, message, unit: "words" };
  }

  if (platform === "instagram") {
    let status: CounterReadout["status"] = "good";
    let message = "On the Instagram caption sweet spot (80-150 words).";
    if (words === 0) {
      status = "warn";
      message = "Empty caption. IG ideal: 80-150 words.";
    } else if (words < 80) {
      status = "warn";
      message = "Short for an IG caption. Aim 80-150 words.";
    } else if (chars > 2200) {
      status = "over";
      message = "Hard cap exceeded (2200 chars). Trim before posting.";
    } else if (chars > 1000) {
      status = "warn";
      message = "Long IG caption. Under 1000 chars feels lighter.";
    } else if (words > 150) {
      status = "warn";
      message = "A touch long for IG. Sweet spot 80-150 words.";
    }
    const firstNote =
      chars <= 138
        ? `First ${chars}/138 chars (whole caption above the 'more' fold).`
        : `First 138 chars decide whether IG users tap 'more'. Make them count.`;
    return { words, chars, status, message, firstNote, unit: "words" };
  }

  if (platform === "facebook") {
    let status: CounterReadout["status"] = "good";
    let message = "On the Facebook sweet spot (40-80 words).";
    if (words === 0) {
      status = "warn";
      message = "Empty post. FB ideal: 40-80 words.";
    } else if (words < 40) {
      status = "warn";
      message = "Short for FB. Aim 40-80 words.";
    } else if (words > 150) {
      status = "over";
      message = "Long for FB (over 150 words). Trim hard.";
    } else if (words > 80) {
      status = "warn";
      message = "A touch long for FB. Sweet spot 40-80 words.";
    }
    return { words, chars, status, message, unit: "words" };
  }

  // tiktok
  let status: CounterReadout["status"] = "good";
  let message = "On the TikTok caption sweet spot (80-150 chars).";
  if (chars === 0) {
    status = "warn";
    message = "Empty caption. TikTok ideal: 80-150 chars.";
  } else if (chars < 80) {
    status = "warn";
    message = "Short for TikTok caption. Aim 80-150 chars.";
  } else if (chars > 2200) {
    status = "over";
    message = "Hard cap exceeded (2200 chars). Trim before posting.";
  } else if (chars > 150) {
    status = "warn";
    message = "A touch long for TikTok. Sweet spot 80-150 chars.";
  }
  return { words, chars, status, message, unit: "chars" };
}

// What each platform enforces on the text that gets posted (sign-off and
// disclosure included): a character cap, and Instagram's 30-hashtag cap.
// LinkedIn takes more hashtags but works best with 3 or fewer, and shows a
// post with a link in it to fewer people.
export const MAX_CHARS: Record<PlatformId, number> = {
  instagram: 2200,
  tiktok: 2200,
  linkedin: 3000,
  facebook: 63206,
};

const NAMES: Record<PlatformId, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  facebook: "Facebook",
};

export interface LimitCheck {
  chars: number;
  maxChars: number;
  hashtags: number;
  links: number;
  warnings: { level: "warn" | "over"; message: string }[];
}

export function countHashtags(text: string): number {
  return (text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
}

// A link a feed makes clickable: http(s) or www. A sentence's closing
// punctuation after it is not part of it.
const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
const TRAIL = /[.,;:!?]+$/;
const LINK_POINTER = "(link in the first comment)";

export function findLinks(text: string): string[] {
  return (text.match(LINK) ?? []).map((l) => l.replace(TRAIL, ""));
}

// A link compared without its scheme, www., query (UTM tags), fragment or closing slash.
const bare = (l: string) => l.toLowerCase().replace(/^(?:https?:\/\/)?(?:www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");

/** Links in the text that are none of `allowed` (the brand kit's offers and DM links), once each. */
export function strayLinks(text: string, allowed: string[]): string[] {
  const ok = new Set(allowed.map(bare));
  return [...new Set(findLinks(text))].filter((l) => !ok.has(bare(l)));
}

/**
 * The post with each link swapped for a pointer to the first comment, and the
 * first comment's text: the links already there plus the new ones, once each.
 * Null when the post has no link.
 */
export function moveLinksToComment(text: string, comment = ""): { body: string; comment: string } | null {
  const links = comment.split("\n").filter((l) => l.trim());
  let moved = false;
  const body = text.replace(LINK, (raw) => {
    const link = raw.replace(TRAIL, "");
    moved = true;
    if (!links.includes(link)) links.push(link);
    return LINK_POINTER + raw.slice(link.length);
  });
  return moved ? { body, comment: links.join("\n") } : null;
}

/** `offers`: the brand kit's links; when there are any, every other link is flagged. */
export function checkLimits(text: string, platform: PlatformId, offers: string[] = []): LimitCheck {
  const chars = countChars(text);
  const maxChars = MAX_CHARS[platform];
  const hashtags = countHashtags(text);
  const links = findLinks(text).length;
  const warnings: LimitCheck["warnings"] = [];
  if (chars > maxChars) {
    warnings.push({
      level: "over",
      message: `Over ${NAMES[platform]}'s ${maxChars.toLocaleString("en-US")} character limit by ${(chars - maxChars).toLocaleString("en-US")}. Trim before posting.`,
    });
  }
  if (platform === "instagram" && hashtags > 30) {
    warnings.push({ level: "over", message: `Instagram allows 30 hashtags. Remove ${hashtags - 30}.` });
  }
  if (platform === "linkedin" && hashtags > 3) {
    warnings.push({ level: "warn", message: `LinkedIn works best with 3 hashtags or fewer. Remove ${hashtags - 3}.` });
  }
  if (platform === "linkedin" && links > 0) {
    warnings.push({ level: "warn", message: "LinkedIn shows posts with a link to fewer people." });
  }
  if (offers.length) for (const l of strayLinks(text, offers)) warnings.push({ level: "warn", message: `Not one of your offer links: ${l}` });
  return { chars, maxChars, hashtags, links, warnings };
}

// Where the feed cuts a post off behind "...more", roughly: LinkedIn about 210
// characters or 3 lines, Instagram about 125 characters or 2 lines, Facebook
// about 480 characters or 5 lines (figures as cited in the platforms' own
// creator guides; they shift by device, so treat them as a guide).
const FOLD: Record<string, { chars: number; lines: number }> = {
  linkedin: { chars: 210, lines: 3 },
  instagram: { chars: 125, lines: 2 },
  facebook: { chars: 480, lines: 5 },
};

/** The index the post is cut at before "...more", or null when the whole post shows. */
export function foldAt(text: string, platform: string): number | null {
  const rule = FOLD[platform];
  if (!rule || !text) return null;
  let cut = Math.min(text.length, rule.chars);
  let from = 0;
  for (let line = 0; line < rule.lines; line++) {
    const nl = text.indexOf("\n", from);
    if (nl === -1) break;
    if (line === rule.lines - 1) cut = Math.min(cut, nl);
    from = nl + 1;
  }
  if (cut >= text.trimEnd().length) return null;
  // break at a word, not mid-word
  const space = text.lastIndexOf(" ", cut);
  return space > cut - 25 && space > 0 && text[cut] !== "\n" && text[cut] !== " " ? space : cut;
}

// Spoken words that fit a reel at a natural pace: about 35-40 for 15 seconds,
// 70-80 for 30 and 125-150 for 60. A length in between reads its range off the
// line joining its neighbours; a shorter or longer one keeps the nearest pace.
const REEL_WORDS = [
  { seconds: 15, min: 35, max: 40 },
  { seconds: 30, min: 70, max: 80 },
  { seconds: 60, min: 125, max: 150 },
];
export const REEL_LENGTHS = [15, 30, 60] as const;
export type ReelLength = (typeof REEL_LENGTHS)[number];

export function reelWordRange(seconds: number): { min: number; max: number } {
  const first = REEL_WORDS[0];
  const last = REEL_WORDS[REEL_WORDS.length - 1];
  const at = (min: number, max: number) => ({ min: Math.round(min), max: Math.round(max) });
  if (seconds <= first.seconds) return at((first.min * seconds) / first.seconds, (first.max * seconds) / first.seconds);
  if (seconds >= last.seconds) return at((last.min * seconds) / last.seconds, (last.max * seconds) / last.seconds);
  const i = REEL_WORDS.findIndex((r) => r.seconds >= seconds) - 1;
  const [a, b] = [REEL_WORDS[i], REEL_WORDS[i + 1]];
  const t = (seconds - a.seconds) / (b.seconds - a.seconds);
  return at(a.min + t * (b.min - a.min), a.max + t * (b.max - a.max));
}

// "HOOK (first 3 seconds):", "Body:", "CTA:" in front of a spoken line.
const SPOKEN_LABEL = /^(?:hook|body|cta|call[\s-]to[\s-]action|intro|outro|close)\b\s*(?:\([^)]*\))?\s*:\s*/i;
// A line that is a stage direction or a note for the edit, not something said.
const NOT_SPOKEN =
  /^(?:\[[^\]]*\]|\([^)]*\)|(?:on[\s-]screen|text on screen|visuals?|b[\s-]?roll|burned[\s-]in|shot|scene|camera)\b[^:]*:.*)$/i;

/** Words said on camera in a short-video script. */
export function spokenWords(script: string): number {
  return script.split("\n").reduce((n, raw) => {
    const line = raw.replace(/[*_#>]/g, "").trim();
    return !line || NOT_SPOKEN.test(line) ? n : n + countWords(line.replace(SPOKEN_LABEL, ""));
  }, 0);
}

/** Seconds a script takes to say at a natural pace (about 2.5 words a second). */
export const spokenSeconds = (words: number) => Math.round(words / 2.5);

/** A plain warning when a script has more words than its length fits, else null. */
export function reelTooLong(words: number, seconds: number): string | null {
  const { min, max } = reelWordRange(seconds);
  return words > max ? `Long for ${seconds}s. Aim for ${min}-${max} words.` : null;
}

/** The writer's instruction for a short video of this length. */
export function reelLengthRule(seconds: number): string {
  const { min, max } = reelWordRange(seconds);
  return `Video length: ${seconds} seconds. Keep the spoken script to about ${min}-${max} spoken words. This overrides the 30-60 second guide for the format.`;
}

// A fact the writer left for the adviser to fill, like "[your number]" or
// "[client's age]". Not a markdown link, a bracket with no letter in it, or a
// bracket alone on its line (a stage direction or a note for the designer).
const BLANK = /\[[^[\]\n]*\p{L}[^[\]\n]*\](?!\()/gu;
const MAX_BLANK_CHARS = 60;

/** Where each blank sits in the text, as [start, end). */
export function blankRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of text.matchAll(BLANK)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = text.indexOf("\n", end);
    const alone = !text.slice(lineStart, start).trim() && !text.slice(end, lineEnd === -1 ? undefined : lineEnd).trim();
    if (m[0].length <= MAX_BLANK_CHARS && !alone) out.push([start, end]);
  }
  return out;
}

/** Each blank still in the text, once, in order. */
export function findBlanks(text: string): string[] {
  return [...new Set(blankRanges(text).map(([a, b]) => text.slice(a, b)))];
}

/** The writer's rule: a blank in place of any fact the brief does not give. */
export const BLANKS_RULE =
  "Never invent a number, statistic, date, name, quote or client story. When the post needs one this brief does not give, write a short blank in square brackets that says what goes there, such as [your number], [client's age] or [latest CPF figure], and keep writing around it. Use a blank only where a real fact is needed.";
