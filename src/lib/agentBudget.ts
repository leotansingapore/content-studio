// The agent's budget (docs/north-star/items/agent-budget.md): the uses each plan spends from today's caps, what is
// short, the cheaper offers that fit, and the fixed answers. Pure: today's counts come in as `Usage` (readUsage), and
// every price comes from the price table (prices.ts, explainerPrice), never typed.

import { explainerPrice } from "@/data/formats";
import { usesLeft, type Usage } from "@/lib/aiUsage";
import { BATCH } from "@/lib/campaignJob";
import { AVATAR_MAX, priceOf, priceText, sumPrices, type Price } from "@/lib/prices";
import { DEFAULT_LENGTH, talkCaps } from "@/lib/talkingHead";
import { DAILY_LIMITS, type UsageFeature } from "../../supabase/functions/_shared/usageCaps.ts";

// shortcut: contracts (wave 1) adds agent-act and skill-answer to DAILY_LIMITS; once it merges this union is UsageFeature.
export type Cap = UsageFeature | "agent-act" | "skill-answer";
export interface Need {
  feature: Cap;
  n: number;
}
/** Every plan the agent runs (phase6-build-brief.md, "What each plan runs"). */
export type Plan =
  | "post" | "carousel" | "script" | "slideshow" | "wall" | "link" | "speaking" | "explainer" | "image"
  | "competitor" | "move" | "write" | "campaign" | "learning" | "edit" | "answer";

const one = (...features: Cap[]): Need[] => features.map((feature) => ({ feature, n: 1 }));
const talk = (o: { write: boolean; presenter: boolean }) => one("ai-video", ...talkCaps({ length: DEFAULT_LENGTH, ...o }));

/** The uses each plan spends today, scarcest first: a card's "left today" counts the first. */
export const NEEDS: Record<Plan, Need[]> = {
  post: one("remix-make"),
  carousel: one("remix-make"),
  script: one("remix-make"),
  slideshow: one("remix-make"),
  wall: one("remix-make"),
  link: one("remix-make", "remix-link"),
  // the script still to write, with a saved face or a kept presenter (needsOf for the other cases)
  speaking: talk({ write: true, presenter: false }),
  explainer: one("ai-video", "ai-voice", "ai-video-script"),
  image: one("ai-image"),
  competitor: one("competitor-read"),
  move: [],
  write: [], // Write's own writer has no cap here
  campaign: one("campaign-draft"),
  learning: [],
  edit: one("edit-ask"),
  answer: one("skill-answer"),
};

/**
 * A plan's uses as it stands: a talking video adds remix-make only while its script is still to write and ai-image
 * only when it makes a new presenter; a campaign's writing is one campaign-draft per 7 posts; an edit to a video is vibe-edit.
 */
export function needsOf(plan: Plan, o: { write?: boolean; presenter?: boolean; posts?: number; video?: boolean } = {}): Need[] {
  if (plan === "speaking") return talk({ write: o.write ?? true, presenter: !!o.presenter });
  if (plan === "campaign" && o.posts) return [{ feature: "campaign-draft", n: Math.ceil(o.posts / BATCH) }];
  if (plan === "edit" && o.video) return one("vibe-edit");
  return NEEDS[plan];
}

/** Today's limit for a cap; undefined for one DAILY_LIMITS does not hold. */
export const limitOf = (f: string): number | undefined => (DAILY_LIMITS as Record<string, number | undefined>)[f];

/** Uses left today; null when today's counts weren't read or the cap is unknown, and then the server decides. */
export const leftOf = (u: Usage | null, f: Cap, now = new Date()): number | null =>
  limitOf(f) === undefined ? null : usesLeft(u, f as UsageFeature, now);

export interface Short {
  feature: Cap;
  needs: number;
  left: number;
}

/**
 * The caps with fewer uses left than the plan needs, in the plan's order. On Leo's own sign-in (GLOBAL_COUNTER_USER,
 * the one where the across-everyone rows are readable) each cap's "-global" row is checked too. Empty when unread.
 */
export function shortOf(needs: Need[], usage: Usage | null, o: { leoGlobal: boolean; now?: Date }): Short[] {
  const rows = o.leoGlobal
    ? needs.flatMap((x) => [x, ...(limitOf(`${x.feature}-global`) === undefined ? [] : [{ feature: `${x.feature}-global` as Cap, n: x.n }])])
    : needs;
  return rows.flatMap(({ feature, n }) => {
    const left = leftOf(usage, feature, o.now);
    return left !== null && left < n ? [{ feature, needs: n, left }] : [];
  });
}

const UNITS: Partial<Record<Cap, [string, string]>> = {
  "ai-video": ["AI video", "AI videos"],
  "ai-voice": ["voiceover", "voiceovers"],
  "ai-image": ["AI picture", "AI pictures"],
  "remix-make": ["remix", "remixes"],
  "remix-link": ["link read", "link reads"],
  "ai-video-script": ["video script", "video scripts"],
  "competitor-read": ["competitor look-up", "competitor look-ups"],
  "campaign-draft": ["campaign write", "campaign writes"],
  "edit-ask": ["edit", "edits"],
  "vibe-edit": ["video edit", "video edits"],
  "skill-answer": ["answer", "answers"],
  "agent-act": ["agent message", "agent messages"],
};

/** "1 AI video", "2 AI videos". */
export const unitOf = (f: Cap, n: number): string => (UNITS[f] ?? ["use", "uses"])[n === 1 ? 0 : 1];
/** "videos", "pictures": beside a price, which already says it is AI ("1 of 2 videos left today"). */
export const leftUnit = (f: Cap): string | null => UNITS[f]?.[1].replace(/^AI /, "") ?? null;

export interface Offer {
  plan: "image" | "script" | "carousel" | "post" | "write" | "paste";
  chip: string;
  /** Write's format, for links.generate({ detail, format }) on "Write it in Write". */
  format?: string;
  /** Uses left of the offer's own cap (null when unread); absent for an offer with no cap. */
  left?: number | null;
}

const OFFER: Record<Offer["plan"], { chip: string; name?: string; cap?: UsageFeature }> = {
  image: { chip: "Make the picture post", name: "A picture post", cap: "ai-image" },
  script: { chip: "Write the script", name: "A script you film yourself", cap: "remix-make" },
  carousel: { chip: "Make a carousel instead", name: "A carousel", cap: "remix-make" },
  post: { chip: "Make a text post instead", name: "A text post", cap: "remix-make" },
  write: { chip: "Write it in Write" },
  paste: { chip: "Paste their profile link instead" },
};

const LADDER: Partial<Record<Plan, Offer["plan"][]>> = {
  speaking: ["image", "script", "write"],
  explainer: ["image", "script", "write"],
  image: ["carousel", "post"],
  post: ["write"],
  carousel: ["write"],
  script: ["write"],
  competitor: ["paste"],
};

/** The first two cheaper options whose own cap has a use left (or is unread: the server decides). */
export function cheaperFor(plan: Plan, usage: Usage | null, now = new Date()): Offer[] {
  return (LADDER[plan] ?? [])
    .flatMap((p): Offer[] => {
      const cap = OFFER[p].cap;
      const left = cap ? leftOf(usage, cap, now) : undefined;
      if (left === 0) return [];
      const format = p === "write" ? (plan === "post" ? "text-post" : plan === "carousel" ? "carousel" : "short-video") : undefined;
      return [{ plan: p, chip: OFFER[p].chip, ...(cap ? { left } : {}), ...(format ? { format } : {}) }];
    })
    .slice(0, 2);
}

const THING: Partial<Record<Plan, string>> = {
  speaking: "A talking video",
  explainer: "An explainer video",
  image: "A picture",
  competitor: "A competitor look-up",
  campaign: "A campaign",
  edit: "A change",
  answer: "An answer",
};
const BACK = "They come back at 8am Singapore time.";
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const price = (p: Price | "pick" | null) => lower(priceText(p as Price));

/** The reply when a plan is short (`short` not empty): what it needs and has, then the named offers with their price. */
export function refusal(plan: Plan, short: Short[], cheaper: Offer[]): string {
  const s = short[0];
  const base = s.feature.replace(/-global$/, "") as Cap;
  const lines = [
    base !== s.feature
      ? `Today's ${unitOf(base, 2)} for the whole studio are used up. ${BACK}`
      : `${THING[plan] ?? "A remix"} needs ${s.needs} ${unitOf(s.feature, s.needs)}, and you have ${s.left || "none"} left today. ${BACK}`,
  ];
  const [a, b] = cheaper.filter((o) => OFFER[o.plan].name);
  if (a) {
    const { name, cap } = OFFER[a.plan];
    const left = a.left == null ? "" : ` (${a.left} of ${limitOf(cap!)} ${leftUnit(cap!)} left)`;
    const or = b ? `, or ${lower(OFFER[b.plan].name!)} is ${price(priceOf(OFFER[b.plan].cap!))}` : "";
    lines.push(`${name} is ${price(priceOf(cap!))}${left}${or}.`);
  }
  return lines.join("\n");
}

/** The dearest talking video from a topic: its script, a new presenter, the voiceover and the longest video taken. */
const TALK_MAX = sumPrices(priceOf("remix-make"), AVATAR_MAX, priceOf("ai-voice"), priceOf("ai-image"));
const ANSWER_CAPS: Cap[] = ["ai-video", "ai-voice", "ai-image", "remix-make", "agent-act"];
export const UNREAD_LINE = "I can't read today's limits right now. Paid makes still check them before they run.";

/** The `budget` act's fixed answer: today's uses left, then what each kind of make costs. */
export function budgetAnswer(usage: Usage | null, now = new Date()): string {
  if (!usage) return UNREAD_LINE;
  const left = ANSWER_CAPS.flatMap((f) => {
    const n = leftOf(usage, f, now);
    return n === null ? [] : [`${n} of ${limitOf(f)} ${unitOf(f, 2)}`];
  });
  return [
    `Left today: ${left.join(", ")}. ${BACK}`,
    `A talking video is ${price(TALK_MAX)}, an explainer ${price(explainerPrice())} and a picture ${price(priceOf("ai-image"))}. Posts, carousels and scripts are ${price(priceOf("remix-make"))} each.`,
  ].join("\n");
}

/** The agent meter under the composer (null before today's count is read); `warn` at 10 or fewer. */
export function meterLine(left: number | null): { text: string; warn: boolean } | null {
  if (left === null) return null;
  if (left <= 0) return { text: "Agent actions are used up until 8am Singapore time. Questions still get answers.", warn: true };
  return { text: `${left} of ${limitOf("agent-act")} agent messages left today`, warn: left <= 10 };
}
