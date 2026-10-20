// Best for you on Creators (docs/north-star/items/find-creators.md, decision 9 of the phase-2 brief): which of the
// hand-picked creators a brand can learn from. Jev only, one noul per creator, 6 at a time, capped "creator-fit".
// Pure: remix/index.ts hands it the counter and Jev, so it is tested without Deno.
//
// The question names the brand's own audience and offer (decision 6), never "a financial adviser", so a business
// like ActivityTracker is judged as itself. No key on the deployment answers { fit: null } and spends nothing; Jev
// answering for no creator at all gives the use back (it never answered) and also answers { fit: null }.

import { oneLineText } from "../clone-reel/logic.ts";
import { noulOf, type JevAnswer, type JevQuestion } from "../_shared/jev.ts";
import { usageRefusal, type UsageResult } from "../_shared/usageCaps.ts";

/** The hand-picked list is 66; a longer request is refused before anything is counted. */
export const MAX_CREATORS = 70;
/** Jev calls in flight at once. */
export const FIT_BATCH = 6;

export interface CreatorIn {
  id: string;
  name: string;
  why: string;
  niche: string[];
  audience: string[];
}

export interface CreatorFitRequest {
  mode: "creator-fit";
  serves: string;
  sells: string;
  topics: string[];
  creators: CreatorIn[];
}

type Item = Record<string, unknown>;
const obj = (v: unknown): Item => (v && typeof v === "object" && !Array.isArray(v) ? (v as Item) : {});
const words = (v: unknown, n: number, max: number) =>
  (Array.isArray(v) ? v : []).map((x) => oneLineText(x, max)).filter(Boolean).slice(0, n);

/** null when the request can't be judged: no audience, no creators, more than 70, or a creator without an id or name. */
export function parseCreatorFitRequest(raw: unknown): CreatorFitRequest | null {
  const r = obj(raw);
  if (r.mode !== "creator-fit" || !Array.isArray(r.creators)) return null;
  if (r.creators.length === 0 || r.creators.length > MAX_CREATORS) return null;
  const serves = oneLineText(r.serves, 300);
  if (!serves) return null;
  const seen = new Set<string>();
  const creators: CreatorIn[] = [];
  for (const c of r.creators.map(obj)) {
    const id = oneLineText(c.id, 80);
    const name = oneLineText(c.name, 80);
    if (!id || !name) return null;
    if (seen.has(id)) continue;
    seen.add(id);
    creators.push({ id, name, why: oneLineText(c.why, 300), niche: words(c.niche, 8, 40), audience: words(c.audience, 8, 40) });
  }
  return { mode: "creator-fit", serves, sells: oneLineText(r.sells, 300), topics: words(r.topics, 12, 60), creators };
}

export const CREATOR_FIT_QUESTIONS: Record<string, JevQuestion> = {
  fit: {
    type: "noul",
    instructions:
      "Would a business that sells `sells` to `serves`, and posts about `topics`, pick up ideas it can use from how `creator` posts, given `creator` is followed for `why`?",
  },
};

/** What Jev reads for one creator: the brand's audience, offer and topics beside the creator's own line. */
export function creatorFitState(req: CreatorFitRequest, c: CreatorIn) {
  return { serves: req.serves, sells: req.sells, topics: req.topics, creator: c.name, why: c.why, niche: c.niche, audience: c.audience };
}

export interface CreatorFitDeps {
  /** TYPESAFE_API_KEY is set on the deployment. */
  hasJev: boolean;
  consume(): Promise<UsageResult>;
  refund(day: string): Promise<unknown>;
  ask(state: unknown, q: Record<string, JevQuestion>): Promise<Record<string, JevAnswer> | null>;
}

export async function handleCreatorFit(
  body: unknown,
  deps: CreatorFitDeps,
): Promise<{ status: number; body: { fit: Record<string, number> | null } | { code: string; error: string } }> {
  const req = parseCreatorFitRequest(body);
  if (!req) return { status: 400, body: { code: "bad_request", error: "There are no creators to sort." } };
  if (!deps.hasJev) return { status: 200, body: { fit: null } };
  // the counter's day (UTC), read before the count, so a refund near midnight finds the row
  const day = new Date().toISOString().slice(0, 10);
  const usage = await deps.consume();
  if (!usage.allowed) return usageRefusal(usage);
  const fit: Record<string, number> = {};
  // shortcut: switch to _shared/pool.ts once competitors-core lands
  for (let i = 0; i < req.creators.length; i += FIT_BATCH) {
    const batch = req.creators.slice(i, i + FIT_BATCH);
    const answers = await Promise.all(batch.map((c) => deps.ask(creatorFitState(req, c), CREATOR_FIT_QUESTIONS).catch(() => null)));
    batch.forEach((c, k) => {
      const n = noulOf(answers[k], "fit");
      if (n !== null) fit[c.id] = n;
    });
  }
  if (Object.keys(fit).length === 0) {
    await deps.refund(day);
    return { status: 200, body: { fit: null } };
  }
  return { status: 200, body: { fit } };
}
