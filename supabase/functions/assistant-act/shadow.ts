// Agent mode's side-by-side run (phase 6 wave 1, decision 12). Every labelled message in fixtures/agent-labelled.json
// goes through Leo's dock request as it is today (remember included) and through agent mode's, both built by this
// function's own actBody and actAsk, and is asked of Jev with _shared/jev.ts (jev-1.13.0). The report lists every
// disagreement on today's acts, every miss against the labels, every answer within 0.15 of a cut and each pick with
// its p. It writes nothing but --out, and is never deployed (index.ts does not import it).
//
//   deno run -A supabase/functions/assistant-act/shadow.ts                    # the counts and the cost, then stops
//   TYPESAFE_API_KEY=... deno run -A supabase/functions/assistant-act/shadow.ts --go [--out DIR]
//
// Two Jev calls a message (about 120 for the 61 messages, about US$0.03). Answers are kept in DIR/answers.json keyed
// by the exact request, so a re-run after a wording change asks again only what changed. Default DIR: the system temp
// folder's agent-shadow/.

import { askJev, type JevAnswer } from "../_shared/jev.ts";
import { mostlyEnglish } from "../post-score/logic.ts";
import { ACT_MIN, APPROVE_MIN, PICK_MIN, SKILL_MIN, actAsk, actBody, actPick, agentPick, type ActBody, type AgentP, type AgentPick } from "./logic.ts";

type Answers = Record<string, JevAnswer> | null;
type Label = Partial<Record<keyof AgentPick, unknown>> & { today?: string };
export interface Item {
  id: string;
  from: string;
  message: string;
  ctx?: string;
  fields?: Record<string, unknown>;
  label: Label;
}
export interface LabelSet {
  today: string;
  contexts: Record<string, { posts: unknown[]; fields: Record<string, unknown> }>;
  items: Item[];
}
type Ask = ReturnType<typeof actAsk>;
export interface Case {
  item: Item;
  today: { body: ActBody; ask: Ask };
  agent: { body: ActBody; ask: Ask };
}

/** Today's acts as Leo's dock offers them: the ones agent mode must not steal. */
export const TODAY_ACTS = ["move", "write", "week", "engage_replies", "engage_dms", "engage_thread", "engage_comment", "remember"];
const NEAR = 0.15;
/** Rough Jev input size: four characters a token, US$0.042 a million. */
const usd = (asks: Ask[]) => (asks.reduce((n, a) => n + JSON.stringify(a).length, 0) / 4) * 0.042e-6;

/** Both requests for every labelled message. Throws on an item the function would refuse, naming it. */
export function cases(set: LabelSet): Case[] {
  return set.items.map((item) => {
    const ctx = set.contexts[item.ctx ?? "leo"];
    if (!ctx) throw new Error(`${item.id}: no context "${item.ctx}"`);
    const raw = { message: item.message, today: set.today, posts: ctx.posts, ...ctx.fields, ...item.fields };
    const today = actBody({ ...raw, agent: false }, true);
    const agent = actBody({ ...raw, agent: true }, true);
    if (!today || !agent) throw new Error(`${item.id}: the function would refuse this body`);
    return { item, today: { body: today, ask: actAsk(today, true) }, agent: { body: agent, ask: actAsk(agent, true) } };
  });
}

/** The right act for today's dock: the label's when today offers it, else none. */
const todayTruth = (l: Label) => l.today ?? (typeof l.act === "string" ? (TODAY_ACTS.includes(l.act) ? l.act : "none") : undefined);
const raw = (a: Answers, id: string) => {
  const c = a?.[id]?.choice;
  const p = c ? a?.[id]?.probabilities?.[c] : undefined;
  return c ? `${c} ${typeof p === "number" ? p.toFixed(2) : "?"}` : "-";
};
const cutOf = (id: string, choice: string | undefined) => (id === "act" ? (choice === "approve" ? APPROVE_MIN : ACT_MIN) : id === "skill" ? SKILL_MIN : PICK_MIN);
/** An option that says nothing reads null on both sides of its cut, so it is never "near" one. */
const says = (id: string, choice: string | undefined) => !!choice && choice !== "none" && choice !== "any" && !(choice === "all" && id !== "scope");

export interface Row {
  id: string;
  message: string;
  label: Label;
  todayAct: string;
  todayRaw: string;
  agentAct: string;
  pick: AgentPick | null;
  p: AgentP;
  agentAnswers: Answers;
}

/** Each case's picks from both answers. */
export function rows(cs: Case[], answer: (c: Case, mode: "today" | "agent") => Answers): Row[] {
  return cs.map((c) => {
    const [ta, aa] = [answer(c, "today"), answer(c, "agent")];
    const { pick, p } = agentPick(aa, c.agent.body);
    return {
      id: c.item.id,
      message: c.item.message,
      label: c.item.label,
      todayAct: actPick(ta, c.today.body, true)?.act ?? "none",
      todayRaw: raw(ta, "act"),
      agentAct: pick?.act ?? "none",
      pick,
      p,
      agentAnswers: aa,
    };
  });
}

const show = (v: unknown) => (v === null || v === undefined ? "null" : String(v));
const quote = (s: string) => `"${s.length > 90 ? `${s.slice(0, 87)}...` : s}"`;

/** The report a person reads: every disagreement and miss in full, then each pick with its p. */
export function report(rs: Row[]): string {
  const scored = rs.filter((r) => typeof r.label.act === "string");
  const agentRight = scored.filter((r) => r.agentAct === r.label.act).length;
  const withToday = rs.filter((r) => todayTruth(r.label) !== undefined);
  const todayRight = withToday.filter((r) => r.todayAct === todayTruth(r.label)).length;
  const steals = rs.filter((r) => (TODAY_ACTS.includes(r.todayAct) || TODAY_ACTS.includes(todayTruth(r.label) ?? "")) && r.agentAct !== r.todayAct);
  const actMisses = scored.filter((r) => r.agentAct !== r.label.act);
  const slotMisses = rs.flatMap((r) =>
    Object.entries(r.label)
      .filter(([k]) => k !== "act" && k !== "today")
      .filter(([k, v]) => show(r.pick?.[k as keyof AgentPick]) !== show(v))
      .map(([k, v]) => `- ${r.id} ${k}: label ${show(v)}, agent ${show(r.pick?.[k as keyof AgentPick])} (Jev: ${raw(r.agentAnswers, k)})`),
  );
  const near = rs.flatMap((r) =>
    Object.entries(r.p)
      .filter(([k, p]) => p !== null && says(k, r.agentAnswers?.[k]?.choice) && Math.abs(p - cutOf(k, r.agentAnswers?.[k]?.choice)) <= NEAR + 1e-9)
      .map(([k]) => `- ${r.id} ${k}: ${raw(r.agentAnswers, k)} (cut ${cutOf(k, r.agentAnswers?.[k]?.choice)})`),
  );
  const pickLine = (r: Row) => {
    const slots = r.pick ? Object.entries(r.pick).filter(([k, v]) => k !== "act" && v !== null).map(([k, v]) => `${k} ${v}`) : [];
    const ps = Object.entries(r.p).filter(([, v]) => v !== null).map(([k, v]) => `${k} ${v!.toFixed(2)}`);
    return `- ${r.id}: ${r.agentAct}${slots.length ? ` (${slots.join(", ")})` : ""} | p: ${ps.join(", ") || "none"}`;
  };
  return [
    "# assistant-act agent mode, side by side",
    "",
    `${rs.length} messages. Agent act right on ${agentRight} of ${scored.length} labelled; today's dock right on ${todayRight} of ${withToday.length}.`,
    "",
    `## Today's acts, agent mode against today's dock (${steals.length})`,
    "",
    ...(steals.length ? steals.map((r) => `- ${r.id} ${quote(r.message)}: label ${show(r.label.act)}, today ${r.todayAct} (Jev: ${r.todayRaw}), agent ${r.agentAct} (Jev: ${raw(r.agentAnswers, "act")})`) : ["None."]),
    "",
    `## Agent act misses (${actMisses.length})`,
    "",
    ...(actMisses.length ? actMisses.map((r) => `- ${r.id} ${quote(r.message)}: label ${r.label.act}, agent ${r.agentAct} (Jev: ${raw(r.agentAnswers, "act")})`) : ["None."]),
    "",
    `## Slot misses (${slotMisses.length})`,
    "",
    ...(slotMisses.length ? slotMisses : ["None."]),
    "",
    `## Within ${NEAR} of a cut (${near.length})`,
    "",
    ...(near.length ? near : ["None."]),
    "",
    "## Every pick with its p",
    "",
    ...rs.map(pickLine),
    "",
  ].join("\n");
}

async function key(ask: Ask): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(ask)));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function main() {
  const args = Deno.args;
  const outAt = args.indexOf("--out");
  const out = outAt >= 0 ? args[outAt + 1] : `${Deno.env.get("TMPDIR") ?? "/tmp"}/agent-shadow`;
  const set = JSON.parse(await Deno.readTextFile(new URL("./fixtures/agent-labelled.json", import.meta.url))) as LabelSet;
  const cs = cases(set);
  const english = cs.filter((c) => mostlyEnglish(c.item.message));
  const asks = english.flatMap((c) => [c.today.ask, c.agent.ask]);
  console.log(`${cs.length} messages, ${asks.length} Jev calls, about US$${usd(asks).toFixed(3)} (rough, from the request size).`);
  if (!args.includes("--go")) return console.log("Add --go to ask Jev.");
  if (!Deno.env.get("TYPESAFE_API_KEY")) throw new Error("TYPESAFE_API_KEY is not set.");
  await Deno.mkdir(out, { recursive: true });
  const cacheAt = `${out}/answers.json`;
  const cache: Record<string, Answers> = await Deno.readTextFile(cacheAt).then(JSON.parse).catch(() => ({}));
  const got = new Map<Case, { today: Answers; agent: Answers }>();
  const queue = [...english];
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const both = { today: null as Answers, agent: null as Answers };
      for (const mode of ["today", "agent"] as const) {
        const ask = c[mode].ask;
        const k = await key(ask);
        if (!(k in cache) || cache[k] === null) cache[k] = await askJev(ask.state, ask.questions, { who: `agent-shadow ${c.item.id} ${mode}`, timeoutMs: 15000 });
        both[mode] = cache[k];
      }
      got.set(c, both);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  await Deno.writeTextFile(cacheAt, JSON.stringify(cache, null, 1));
  const missing = english.filter((c) => !got.get(c)?.agent || !got.get(c)?.today).map((c) => c.item.id);
  const rs = rows(cs, (c, mode) => got.get(c)?.[mode] ?? null);
  const text = (missing.length ? `No Jev answer for ${missing.length} messages; run again to retry them: ${missing.join(", ")}\n\n` : "") + report(rs);
  await Deno.writeTextFile(`${out}/agent-shadow.md`, text);
  await Deno.writeTextFile(`${out}/agent-shadow.json`, JSON.stringify(rs, null, 1));
  console.log(text);
  console.log(`Written to ${out}/agent-shadow.md and agent-shadow.json.`);
}

// deno-lint-ignore no-explicit-any
if ((import.meta as any).main) await main();
