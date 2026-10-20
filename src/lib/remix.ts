// The Remix sheet's helpers (docs/north-star/items/remix-everywhere.md): its labels, the full words of a source
// for the remix call, where a remix posts, the "What Remix does" sentence and the call itself. It reads the data
// drops (top posts, ads, trends, inspiration), so only the lazy sheet and job import it, never RemixButton.

import inspirationData from "@/data/inspiration.json";
import type { InspirationEntry } from "@/components/Inspiration";
import { ADS } from "@/lib/adsSwipe";
import { getDraftById } from "@/lib/draftHistory";
import { callFn } from "@/lib/edgeFn";
import { loadFollowing } from "@/lib/following";
import type { Positioning } from "@/lib/positioning";
import { loadSavedClones } from "@/lib/reelClone";
import { sourceKey, sourceNoun, type RemixSource } from "@/lib/remixSource";
import { loadLinkedSources } from "@/lib/resolveSource";
import { getAllTopPosts } from "@/lib/topPosts";
import { TRENDS } from "@/lib/trends";
import type { Close, Keep, MakeRequest, MakeResponse, RemixAs } from "../../supabase/functions/remix/logic.ts";

export { intentsFor } from "../../supabase/functions/remix/logic.ts";
export type { Close, FitReason, Flags, Keep, MakeRequest, MakeResponse, MakeResult, RemixAs } from "../../supabase/functions/remix/logic.ts";

// ---- labels -------------------------------------------------------------------------------

export const KEEP_LABELS: Record<Keep, string> = {
  structure: "Keep the structure",
  hook: "Keep the hook",
  energy: "Same energy, new script",
  topic: "Make it about my topic",
  part2: "Part 2",
  react: "React to it",
};

/** The one line under the Keep chips. */
export const KEEP_HINTS: Record<Keep, string> = {
  structure: "Keeps: beat order, number of points, length. New: hook and every word.",
  hook: "Keeps: the shape of the first line. New: everything after it.",
  energy: "Keeps: tone, pace and length. New: the script.",
  topic: "Keeps: the format and hook style. New: the topic.",
  part2: "Follows your post with a new payoff.",
  react: "Says what you think of it, and credits the original.",
};

/** The done line; keep=topic reads "Moved to <topic>" when it has one. */
export const KEEP_DONE: Record<Keep, string> = {
  structure: "Kept the structure",
  hook: "Kept the hook",
  energy: "Same energy",
  topic: "Moved to your topic",
  part2: "Part 2",
  react: "Your reaction",
};

export const CLOSE_LABELS: Record<Close, string> = { loose: "Loose", balanced: "Balanced", close: "Close" };

/** Tightness only, like the prompt's CLOSE_RULES, so the line never contradicts the Keep pick. */
export const CLOSE_HINTS: Record<Close, string> = {
  loose: "Uses what you keep as a light guide. The rest is yours.",
  balanced: "Follows what you keep, with a new angle. Every line is new.",
  close: "Follows what you keep closely, down to its length. Every line is new.",
};

export const AS_LABELS: Record<RemixAs, string> = {
  post: "Text post",
  carousel: "Carousel",
  script: "Script to film",
  speaking: "You speaking",
  explainer: "Explainer video",
  slideshow: "Slideshow",
  wall: "Wall of text",
};

/** "Writing your script", "Your carousel is ready". */
export const AS_NOUN: Record<RemixAs, string> = {
  post: "text post",
  carousel: "carousel",
  script: "script",
  speaking: "video",
  explainer: "explainer video",
  slideshow: "slideshow",
  wall: "wall of text",
};

const FORMAT_WORDS: Record<RemixAs, string> = {
  post: "a text post",
  carousel: "a carousel",
  script: "a script and shot list",
  speaking: "a video of you saying it",
  explainer: "an explainer video",
  slideshow: "a slideshow",
  wall: "a wall of text",
};

const CLOSE_PHRASE: Record<Close, string> = { loose: "loosely based on it", balanced: "with new words", close: "close to it, with every line new" };

/** The typed note, kept on this device until the remix is done. */
export const noteKey = (key: string) => `cs-remix-note-${key}`;

// ---- the source ---------------------------------------------------------------------------

export function defaultOutput(s: RemixSource): "post" | "carousel" | "script" {
  return s.format === "video" ? "script" : s.format === "carousel" ? "carousel" : "post";
}

const INSPIRATION = inspirationData as InspirationEntry[];
const joined = (parts: (string | null | undefined)[]) =>
  parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join("\n\n");

/** The original's words read from this device for the remix call, at most 2000; the snapshot caption otherwise. */
export function fullText(s: RemixSource, userId: string): string {
  const at = s.key.indexOf(":");
  const prefix = s.key.slice(0, at);
  const rest = s.key.slice(at + 1);
  let text = "";
  if (prefix === "top") text = getAllTopPosts().find((p) => sourceKey.top(p.advisorId, p.shortCode) === s.key)?.caption ?? "";
  if (prefix === "ad") {
    const ad = ADS.find((a) => a.adId === rest);
    text = ad ? joined([ad.headline, ad.body, ad.cta]) : "";
  }
  if (prefix === "follow") {
    const [platform, ...id] = rest.split(":");
    const posts = loadFollowing(userId).filter((a) => a.platform === platform).flatMap((a) => a.posts);
    text = posts.find((p) => p.id === id.join(":"))?.caption ?? "";
  }
  if (prefix === "clone") {
    const c = loadSavedClones(userId).find((x) => x.id === rest);
    text = c ? joined([c.result.source.transcript, c.result.source.caption]) : "";
  }
  if (prefix === "own") text = getDraftById(userId, rest)?.draft ?? "";
  if (prefix === "trend") {
    const t = TRENDS.find((x) => x.id === rest);
    text = t ? joined([t.title, t.why_it_works, ...(t.hooks ?? []), ...(t.talking_points ?? []), t.cta]) : "";
  }
  if (prefix === "insp") {
    const i = INSPIRATION.find((x) => x.id === rest);
    text = i ? joined([i.hook, i.content]) : "";
  }
  if (prefix === "link" || prefix === "upload") text = loadLinkedSources(userId).find((x) => x.key === s.key)?.text ?? "";
  return (joined([text]) || joined([s.caption]) || joined([s.title])).slice(0, 2000);
}

/** Where the remix posts: a video on the source's or the adviser's short-video app, the rest on their main app. */
export function platformFor(s: RemixSource, as: RemixAs, positioning: Pick<Positioning, "platform">): "instagram" | "tiktok" | "linkedin" | "facebook" {
  const mine = positioning.platform;
  if (as === "carousel") return mine === "linkedin" ? "linkedin" : "instagram";
  if (as === "post") return mine === "tiktok" ? "instagram" : mine;
  return s.platform === "tiktok" || mine === "tiktok" ? "tiktok" : "instagram";
}

/** "Slide N:" lines that splitDraftIntoSlides turns back into the cover, one slide each and the CTA. */
export function carouselDraftText(hook: string, slides: { title: string; body: string }[], cta: string): string {
  return [
    `Slide 1: ${hook}`,
    ...slides.map((s, i) => `Slide ${i + 2}: ${s.title}${s.body ? `\n${s.body}` : ""}`),
    `Slide ${slides.length + 2}: ${cta}`,
  ].join("\n\n");
}

const andList = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/** "What Remix does", built from the choices, never by a model. */
export function whatRemixDoes(
  s: RemixSource,
  c: { keep: Keep; about?: string; as: RemixAs[]; close: Close },
  ctx: { brand: string; hasVoice: boolean; teardownCached: boolean },
): string {
  const verb: Record<Keep, string> = {
    structure: "keeps its structure",
    hook: "keeps its hook",
    energy: "keeps its energy",
    topic: `moves it to ${c.about || "your topic"}`,
    part2: "writes its part 2",
    react: "writes your reaction to it",
  };
  return (
    `Reads this ${sourceNoun(s)}${ctx.teardownCached ? "" : ", breaks it down"}, ${verb[c.keep]} and writes ${andList(c.as.map((a) => FORMAT_WORDS[a]))} ` +
    `for ${ctx.brand} in ${ctx.hasVoice ? "your voice" : "a plain voice"}, ${CLOSE_PHRASE[c.close]}. You see it before anything posts.`
  );
}

export function requestMake(body: MakeRequest): Promise<MakeResponse> {
  return callFn<MakeResponse>("remix", body);
}
