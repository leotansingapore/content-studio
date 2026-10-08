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
// LinkedIn takes more hashtags but recommends 3-5.
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
  warnings: { level: "warn" | "over"; message: string }[];
}

export function countHashtags(text: string): number {
  return (text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
}

export function checkLimits(text: string, platform: PlatformId): LimitCheck {
  const chars = countChars(text);
  const maxChars = MAX_CHARS[platform];
  const hashtags = countHashtags(text);
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
  if (platform === "linkedin" && hashtags > 5) {
    warnings.push({ level: "warn", message: `LinkedIn works best with 3-5 hashtags. Remove ${hashtags - 5}.` });
  }
  return { chars, maxChars, hashtags, warnings };
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
