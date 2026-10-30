// Best for your brand on /carousels (the carousel library, supabase/hub/029): Jev only, no AI writing, counted
// against "carousel-fit". Two steps. One call asks which of the library's topics this brand can take ideas from,
// a noul per topic. Then every carousel in the kept topics, biggest multiple first, up to MAX_CANDIDATES, gets a
// Score of how usable it is as a model for this brand's own posts.
// Pure: index.ts hands it the reader, the counter and Jev, so it is tested without Deno.
//
// The questions name the brand's own audience and offer (as creator-fit does), never a profession, so any brand is
// judged as itself. No key on the deployment answers { fit: null } and spends nothing; Jev answering for no
// carousel at all gives the use back and also answers { fit: null }, so the page falls back to the biggest multiple.

import { oneLineText } from "../clone-reel/logic.ts";
import { noulOf, scoreOf, type JevAnswer, type JevQuestion } from "../_shared/jev.ts";
import { usageRefusal, type UsageResult } from "../_shared/usageCaps.ts";

/** Top Carousels' topics, as cs_carousels.topic holds them. */
export const TOPICS = [
  "AI & technology", "Art & photography", "Business", "Content creation", "Design", "Education",
  "Entertainment & pop culture", "Fashion & beauty", "Food & cooking", "Health & fitness", "History & culture",
  "Lifestyle & travel", "Mindset & motivation", "Personal finance", "Productivity", "Psychology", "Relationships",
] as const;

/** proposal: a topic is kept from here up; set from the first real runs. */
export const TOPIC_KEEP = 0.5;
/** Fewer kept than this and the likeliest topics fill the list, so a narrow brand still gets a ranking. */
export const MIN_TOPICS = 3;
export const MAX_CANDIDATES = 240;
/** Jev calls in flight at once. */
export const FIT_POOL = 16;
/** The Score's levels run 0 to 3; fit is score / 3. */
const TOP_LEVEL = 3;

export interface FitRequest {
  serves: string;
  sells: string;
  topics: string[];
}

export interface Candidate {
  id: string;
  title: string;
  topic: string | null;
  format: string | null;
  caption: string;
  slide_text: string[];
}

type Item = Record<string, unknown>;
const obj = (v: unknown): Item => (v && typeof v === "object" && !Array.isArray(v) ? (v as Item) : {});

/** null when the brand can't be judged: no audience. */
export function parseFitRequest(raw: unknown): FitRequest | null {
  const r = obj(raw);
  const serves = oneLineText(r.serves, 300);
  if (!serves) return null;
  const topics = (Array.isArray(r.topics) ? r.topics : []).map((t) => oneLineText(t, 60)).filter(Boolean).slice(0, 12);
  return { serves, sells: oneLineText(r.sells, 300), topics };
}

const brandState = (req: FitRequest) => ({ serves: req.serves, sells: req.sells, topics: req.topics });

/** One noul per topic, over the brand alone. */
export function topicAsk(req: FitRequest): { state: unknown; questions: Record<string, JevQuestion> } {
  const questions: Record<string, JevQuestion> = {};
  TOPICS.forEach((t, i) => {
    questions[`t${i}`] = {
      type: "noul",
      instructions: `Would a business that sells \`sells\` to \`serves\`, and posts about \`topics\`, find Instagram carousels about ${t} useful as models for its own posts?`,
    };
  });
  return { state: brandState(req), questions };
}

/** The topics Jev keeps: TOPIC_KEEP and up, else the MIN_TOPICS likeliest. null when Jev answered none. */
export function keptTopics(answers: Record<string, JevAnswer> | null): string[] | null {
  const scored = TOPICS.map((t, i) => ({ t, p: noulOf(answers, `t${i}`) })).filter((x): x is { t: (typeof TOPICS)[number]; p: number } => x.p !== null);
  if (!scored.length) return null;
  scored.sort((a, b) => b.p - a.p);
  const kept = scored.filter((x) => x.p >= TOPIC_KEEP);
  return (kept.length >= MIN_TOPICS ? kept : scored.slice(0, MIN_TOPICS)).map((x) => x.t);
}

export const FIT_QUESTIONS: Record<string, JevQuestion> = {
  fit: {
    type: "score",
    instructions: "How usable is `carousel` as a model for an Instagram carousel this business would post for `serves`?",
    criteria: [
      "Nothing in it fits this business or the people it serves",
      "Only the format could be borrowed; the subject is far from what the business does",
      "The subject is close to the business's topics, and the people it serves would care about it",
      "Made for the same people this business serves: it could be remade for the business almost as it is",
    ],
  },
};

/** What Jev reads for one carousel: the brand beside the carousel's title, topic, format and first words. */
export function fitState(req: FitRequest, c: Candidate) {
  const words = [c.slide_text.slice(0, 3).join(" / "), c.caption].map((s) => oneLineText(s, 400)).filter(Boolean).join(" | ");
  return { ...brandState(req), carousel: { title: oneLineText(c.title, 200), topic: c.topic, format: c.format, words } };
}

export interface FitDeps {
  /** TYPESAFE_API_KEY is set on the deployment. */
  hasJev: boolean;
  consume(): Promise<UsageResult>;
  refund(day: string): Promise<unknown>;
  ask(state: unknown, q: Record<string, JevQuestion>): Promise<Record<string, JevAnswer> | null>;
  /** The carousels in these topics, biggest multiple first, at most `limit`. */
  candidates(topics: string[], limit: number): Promise<Candidate[]>;
}

type Reply = { status: number; body: { fit: Record<string, number> | null; topics?: string[] } | { code: string; error: string } };

export async function handleFit(body: unknown, deps: FitDeps): Promise<Reply> {
  const req = parseFitRequest(body);
  if (!req) return { status: 400, body: { code: "bad_request", error: "Add who you serve on Strategy first, then Best for your brand can rank the library." } };
  if (!deps.hasJev) return { status: 200, body: { fit: null } };
  // the counter's day (UTC), read before the count, so a refund near midnight finds the row
  const day = new Date().toISOString().slice(0, 10);
  const usage = await deps.consume();
  if (!usage.allowed) return usageRefusal(usage);
  const giveBack = async (): Promise<Reply> => {
    await Promise.resolve(deps.refund(day)).catch(() => null);
    return { status: 200, body: { fit: null } };
  };
  const ask = topicAsk(req);
  const topics = keptTopics(await deps.ask(ask.state, ask.questions).catch(() => null));
  if (!topics) return await giveBack();
  const list = await deps.candidates(topics, MAX_CANDIDATES);
  const fit: Record<string, number> = {};
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const c = list[next++];
      const s = scoreOf(await deps.ask(fitState(req, c), FIT_QUESTIONS).catch(() => null), "fit");
      if (s !== null) fit[c.id] = Math.round((s / TOP_LEVEL) * 1000) / 1000;
    }
  };
  await Promise.all(Array.from({ length: Math.min(FIT_POOL, list.length) }, worker));
  if (Object.keys(fit).length === 0) return await giveBack();
  return { status: 200, body: { fit, topics } };
}
