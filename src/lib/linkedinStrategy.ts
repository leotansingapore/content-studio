// The LinkedIn strategy interview (/linkedin): the answers and the strategy the linkedin-strategy function writes from
// them, kept on this device per brand under a content-studio- key (cloudSync mirrors it). Each angle opens Write on
// LinkedIn with its funnel stage and the angle as the topic.

import { links } from "@/lib/links";
import { callFn } from "@/lib/edgeFn";
import { loadPositioning } from "@/lib/positioning";
import { professionFor } from "@/lib/profession";
import { scoped } from "@/lib/profiles";
import { ownBrandName } from "@/lib/remixBrand";
import { ANSWER_KEYS, type Answers, type Stage, type Strategy } from "../../supabase/functions/linkedin-strategy/logic.ts";

export * from "../../supabase/functions/linkedin-strategy/logic.ts";

export interface SavedStrategy {
  answers: Answers;
  strategy: Strategy | null;
  /** ISO time the strategy was written. */
  writtenAt: string | null;
}

const key = (userId: string) => `content-studio-linkedin-strategy-${scoped(userId)}`;

export const emptyAnswers = (): Answers => Object.fromEntries(ANSWER_KEYS.map((k) => [k, ""])) as Answers;

/** What the positioning already says, for a first visit: the one-liner and the exact audience. */
export function prefilled(userId: string): Answers {
  const p = loadPositioning(userId);
  return { ...emptyAnswers(), offer: p?.oneLiner.trim() ?? "", buyer: p?.audienceDetail.trim() ?? "" };
}

export function loadStrategy(userId: string): SavedStrategy {
  try {
    const raw = JSON.parse(localStorage.getItem(key(userId)) ?? "null");
    if (raw && typeof raw === "object" && raw.answers && typeof raw.answers === "object") {
      const answers = Object.fromEntries(ANSWER_KEYS.map((k) => [k, typeof raw.answers[k] === "string" ? raw.answers[k] : ""])) as Answers;
      const strategy = raw.strategy && typeof raw.strategy === "object" && Array.isArray(raw.strategy.top) ? (raw.strategy as Strategy) : null;
      return { answers, strategy, writtenAt: strategy && typeof raw.writtenAt === "string" ? raw.writtenAt : null };
    }
  } catch {
    // unreadable or blocked: start again from the positioning
  }
  return { answers: prefilled(userId), strategy: null, writtenAt: null };
}

export function saveStrategy(userId: string, s: SavedStrategy): void {
  try {
    localStorage.setItem(key(userId), JSON.stringify(s));
  } catch {
    // storage full or blocked: kept while the page stays open
  }
}

export const WRITE_FAILED = "Couldn't write your strategy. Try again in a minute.";

/** One use of linkedin-strategy. Throws EdgeError with the server's words (the daily limit, a missing answer). */
export const requestStrategy = (userId: string, answers: Answers) =>
  callFn<{ strategy: Strategy }>("linkedin-strategy", { answers, name: ownBrandName(userId), profession: professionFor(userId) }, WRITE_FAILED);

/** Top, middle and bottom of funnel are Write's Attraction, Building Trust and Conversion. */
export const FUNNEL_OF: Record<Stage, "attraction" | "trust" | "conversion"> = { top: "attraction", middle: "trust", bottom: "conversion" };
export const STAGE_LABEL: Record<Stage, string> = { top: "Top of funnel", middle: "Middle of funnel", bottom: "Bottom of funnel" };

/** Write, on LinkedIn, with this angle as the topic and its stage as the funnel. */
export const writeLink = (stage: Stage, angle: string) => links.generate({ platform: "linkedin", format: "text-post", funnel: FUNNEL_OF[stage], detail: angle });
