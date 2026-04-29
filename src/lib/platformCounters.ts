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
