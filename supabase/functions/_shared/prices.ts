// What one use of each paid cap costs us, in US$, so a button can show its price before it runs
// (docs/north-star/items/business-cost-preview.md). No Deno or npm imports: the browser reads this same table
// through src/lib/prices.ts, and business-credits charges from it later.
// "unverified" marks a first estimate: check it against the provider's reported cost on Leo's first runs.

import { CLIP_QUALITIES, CLIP_SECONDS, MAX_AVATAR_SECONDS, MAX_SLICE, MAX_SLICES, avatarCredits, clipCredits, creditsUsd, explainerCredits, type ClipQuality } from "../ai-video/logic.ts";
import type { UsageFeature } from "./usageCaps.ts";

export type PriceKind = "about" | "from" | "upTo";
export interface Price {
  usd: number;
  kind: PriceKind;
}
export interface PriceOpts {
  seconds?: number;
  quality?: ClipQuality;
  slices?: number[];
  scenes?: number;
  minutes?: number;
  passes?: number;
  /** An explainer whose scenes move: DoP lite per scene on top of its pictures. */
  move?: boolean;
}

const about = (usd: number): Price => ({ usd, kind: "about" });
/** DoP lite moving one scene's picture for 5 s. Higgsfield estimate 2026-10-09, ai-image/broll.ts. */
export const DOP_LITE_CREDITS = 2;
const upTo = (usd: number): Price => ({ usd, kind: "upTo" });

/** Every paid cap, priced from the cost constants in the functions. A function gives null while its option is not picked. */
export const PRICES: Partial<Record<UsageFeature, Price | ((o: PriceOpts) => Price | null)>> = {
  // Higgsfield credits (ai-video/logic.ts). An avatar by its voiceover slices: about US$2.75 for 15 s, up to US$5.50
  // (AVATAR_MAX, for a price before the script exists). Before the voiceover exists, `seconds` (from the script's
  // words, capped at MAX_AVATAR_SECONDS) is cut the way planSlices cuts flat audio: whole MAX_SLICE slices, then the rest.
  // An explainer by its scene pictures only, plus DOP_LITE_CREDITS a scene with move: callers add priceOf("ai-voice")
  // for its voiceover (sumPrices).
  "ai-video": (o) => {
    if (o.slices?.length) return about(creditsUsd(avatarCredits(o.slices.slice(0, MAX_SLICES))));
    if (o.scenes && o.scenes > 0) return about(creditsUsd(explainerCredits(o.scenes) + (o.move ? DOP_LITE_CREDITS * o.scenes : 0)));
    if (o.seconds && o.seconds > 0) {
      const slices: number[] = [];
      let rest = Math.min(o.seconds, MAX_AVATAR_SECONDS);
      for (; rest > MAX_SLICE; rest -= MAX_SLICE) slices.push(MAX_SLICE);
      return about(creditsUsd(avatarCredits([...slices, rest])));
    }
    return null;
  },
  // Seedance 2.5 by length and quality (ai-video/logic.ts): US$0.82 for 4 s at 480p up to US$3.70 for 8 s at 720p.
  "ai-clip": (o) => {
    const seconds = CLIP_SECONDS.find((s) => s === o.seconds);
    const quality = CLIP_QUALITIES.find((q) => q === o.quality);
    return seconds && quality ? about(creditsUsd(clipCredits(seconds, quality))) : null;
  },
  "ai-image": about(0.006), // Higgsfield Soul v2 at 1080p (ai-image/index.ts)
  // Qwen Image 3 edit at 2k on Higgsfield: US$0.04 at 1k, US$0.075 at 2k (open.higgsfield.ai/models/alibaba/qwen-image-3/edit, read 2026-10-21)
  "ai-image-fix": about(0.075),
  "ai-broll": about(0.13), // Soul v2 picture + DoP lite 5 s (ai-image/broll.ts)
  // Eleven Music at about US$0.15 a minute, and tracks stop at 2 minutes (usageCaps.ts, text-voice MAX_MUSIC_SECONDS).
  "ai-music": (o) => (o.minutes && o.minutes > 0 ? about(0.15 * Math.min(2, o.minutes)) : null),
  // ElevenLabs turbo v2.5: Turbo and Flash US$0.04 per 1,000 characters (elevenlabs.io/pricing/api, read 2026-10-21), and a
  // 30 s voiceover is about 450 characters, US$0.018. The studio's account is on the free plan, so today it spends free characters.
  "ai-voice": about(0.02),
  "ai-video-script": about(0.01), // one OpenAI call (ai-video mode "script"), unverified
  "video-watch": about(0.07), // Gemini watches the file twice, a 40 s reel (usageCaps.ts, video-assist/watch.ts)
  // Whisper list price, US$0.006 a minute of audio, unverified
  "video-transcribe": (o) => (o.minutes && o.minutes > 0 ? about(0.006 * o.minutes) : null),
  "video-captions": about(0.01), // gpt-4.1, about 1 US cent (usageCaps.ts)
  "video-clips": (o) => about(0.02 * Math.max(1, o.passes ?? 1)), // about 2 US cents a pass (video-assist/logic.ts)
  "video-translate": about(0.03), // one OpenAI call of up to 4,000 tokens; the dub's voice is ai-voice, unverified
  "video-cutaways": about(0.01), // one OpenAI call, unverified
  "video-publish": about(0.01), // one short OpenAI call, unverified
  "vibe-edit": about(0.02), // one OpenAI call per chat edit, unverified
  "broll-picks": about(0.01), // Jev picks the lines, one short OpenAI call, unverified
  "montage-beats": about(0.01), // one OpenAI call writes the beats, unverified
  "repurpose-long": about(0.04), // about 4 US cents a run (usageCaps.ts)
  "idea-dump": about(0.02), // one OpenAI call, unverified
  storyboard: about(0.01), // one OpenAI call, unverified
  carousel: about(0.01), // one OpenAI call (carousel-copy), unverified
  "reel-clone": about(0.03), // an Apify post read plus OpenAI's breakdown and script, unverified
  "reel-concepts": about(0.02), // one OpenAI call on the cached post, unverified
  "reel-visuals": about(0.02), // OpenAI reads the frames, unverified
  "reel-style": about(0.01), // an Apify post read, no OpenAI, unverified
  "track-accounts": about(0.03), // an Apify read of the account's newest posts, unverified
  mentions: upTo(0.01), // up to 5 DataForSEO news searches, unverified
  feeds: about(0.001), // no provider: the function fetches the feeds itself, unverified
  "yt-captions": about(0.006), // one DataForSEO request (youtube-captions/index.ts)
  // 5 ChatGPT answers at about US$0.004 each (market/index.ts) plus the news on the Mentions keywords, unverified
  "market-check": about(0.03),
  "market-suggest": about(0.01), // one OpenAI call, Jev keeps the ones that fit, unverified
  // Jev sorts, OpenAI drafts: about 2 US cents a run at most (engage-assist/index.ts)
  "engage-replies": upTo(0.02),
  "engage-dms": upTo(0.02),
  "engage-comments": upTo(0.02),
  "engage-connect": upTo(0.02),
  "profile-score": about(0.003), // Jev plus one OpenAI call, about 0.3 US cents (writing-judge/index.ts)
  // gpt-6-luna (OPENAI_MODEL's default) at US$0.10 in / US$0.50 out per million (OpenAI pricing page, read 2026-10-21):
  // about 5,500 in and 700 out for up to 5 pages, plus two Jev calls under US$0.001 at US$0.042 per million
  "brand-dna": about(0.001),
  "remix-make": about(0.02), // unverified
  "remix-teardown": about(0.01), // unverified
  "remix-link": about(0.01), // unverified
  "remix-image": about(0.02), // unverified
  // North star phase 2. Apify at the Free-plan rate (the highest), read 2026-10-20 (phase2-build-brief.md, vendors).
  "competitor-read": about(0.002), // a bare name is one DataForSEO Google page; a site read is free
  "competitor-suggest": upTo(0.02), // two OpenAI calls plus up to 88 Jev questions, unverified
  "competitor-ads": upTo(0.174), // 30 ads x US$5.80 per 1,000
  "competitor-posts": upTo(0.123), // TikTok 33 x US$3.70 per 1,000 + US$0.001; Instagram US$0.092
  "space-ads": upTo(0.522), // 90 ads x US$5.80 per 1,000
  "viral-search": about(0.077), // 20 TikTok results + one YouTube block + Jev
  "post-tags": about(0.01), // teardown OpenAI + Jev, unverified
  "search-topics": upTo(0.098), // 5 Labs tasks + 30 items each + 10 YouTube pages
  "remix-patterns": about(0.01), // Jev on 12 posts + one OpenAI call, unverified
  // North star phase 3 (phase3-build-brief.md, vendors).
  "own-words": about(0.01), // one short LLM call plus one Jev pick, unverified
  "thread-copy": about(0.01), // one LLM call, unverified
  "edit-ask": about(0.002), // about 700 tokens in and 100 out at gpt-4.1's US$2 / US$8 per million
  // North star phase 4 (phase4-build-brief.md, vendors, read 2026-10-21).
  "likeness-check": about(0.002), // Whisper US$0.006 a minute on a 15 s clip
  // one Soul v2 picture, 0.09 credits; a make is 3 uses, so its chip is sumPrices of three
  "ai-presenter": about(0.006),
  "brand-products": about(0.002), // gpt-6-luna, about 8,000 in and 2,000 out, plus Jev
  "media-sort": about(0.001), // gpt-4.1 low-detail vision (85 tokens plus 250 of prompt in, 80 out) plus one Jev pick
  "post-translate": about(0.01), // gpt-4.1, about 600 in and 1,000 out
  // North star phase 5 (phase5-build-brief.md, vendors, read 2026-10-22).
  "audience-suggest": about(0.001), // gpt-6-luna, about 5,500 in and 900 out, plus Jev
  "campaign-angles": about(0.008), // gpt-4.1, about 1,200 in and 700 out, plus 16 Jev questions
  // gpt-4.1, up to 7 posts a call, about 2,500 in and 3,500 out, plus the MAS question per post
  "campaign-draft": about(0.035),
  "campaign-swap": about(0.005), // gpt-4.1, one post, about 600 in and 500 out
  "ideas-daily": about(0.012), // gpt-4.1, about 2,000 in and 1,000 out, plus Jev
};

/** The dearest avatar the server takes (MAX_SLICES full slices): "Up to US$5.50" before a script exists. */
export const AVATAR_MAX: Price = upTo(creditsUsd(avatarCredits(Array<number>(MAX_SLICES).fill(MAX_SLICE))));

/** Caps that never show a price: Jev-only calls, free or relay calls, across-everyone counters, social reads and writes, team comments. */
export const NO_PRICE: UsageFeature[] = [
  // Jev only
  "post-score", "writing-judge", "fact-check", "cold-open", "motion-picks", "montage-pick", "music-mood", "week-pick",
  "engage-picks", "assistant-act", "remix-fit", "ad-labels", "niche-match", "brief-pick", "creator-fit", "caption-keywords",
  // one capped page fetch and one Jev question
  "page-read",
  // free or a relay; a capped public picture fetch
  "stock-search", "reel-video", "brand-image",
  // across everyone
  "market-check-global", "ai-image-fix-global", "ai-broll-global", "ai-music-global", "ai-video-global", "ai-clip-global",
  "competitor-ads-global", "competitor-posts-global", "space-ads-global", "viral-search-global", "search-topics-global",
  "ai-presenter-global",
  // social reads and writes, team comments
  "social-connect", "social-read", "social-automation-write", "social-schedule", "social-presign", "team-comment",
];

/** Write's own generation: uncapped, on the academy project (generate-social-content). Unverified. */
export const WRITE_PRICE: Price = about(0.01);

/** null for a cap on NO_PRICE, "pick" while a priced option is missing. */
export function priceOf(feature: UsageFeature, o: PriceOpts = {}): Price | "pick" | null {
  const p = PRICES[feature];
  if (!p) return null;
  return typeof p === "function" ? (p(o) ?? "pick") : p;
}

/** One price for a button that spends from several caps: any "pick" gives "pick", nulls are skipped, US$ adds up. */
export function sumPrices(...ps: (Price | "pick" | null)[]): Price | "pick" | null {
  if (ps.includes("pick")) return "pick";
  const real = ps.filter((p): p is Price => p !== null && p !== "pick");
  if (!real.length) return null;
  const has = (k: PriceKind) => real.some((p) => p.kind === k);
  return { usd: real.reduce((n, p) => n + p.usd, 0), kind: has("upTo") ? "upTo" : has("from") ? "from" : "about" };
}

const KIND_WORD: Record<PriceKind, string> = { about: "About", from: "From", upTo: "Up to" };

/** "About US$2.75", "From US$0.82", "Up to US$5.50"; anything under a cent is "Under US$0.01". The one place to switch to SGD. */
export function priceText(p: Price): string {
  return p.usd < 0.01 ? "Under US$0.01" : `${KIND_WORD[p.kind]} US$${p.usd.toFixed(2)}`;
}
