import { askJev, choiceOf, type JevAnswer } from "../_shared/jev.ts";
import { fetchCapped } from "../_shared/safeFetch.ts";
import { AUDIENCES, audienceAsk, parseWritten, readSite, siteUrl, WRITE_FORMAT, writeMessages } from "./logic.ts";
import { aboutText, PROFESSION_MIN, PROFESSION_PICKS, professionAnswer, professionAsk, professionFrom } from "./profession.ts";

type Answers = Record<string, JevAnswer> | null;
export interface Site {
  url: string;
  expect: string;
}
export interface Row {
  url: string;
  expect: string;
  input: "written" | "description" | "none";
  about: string;
  error: string;
  key: string | null;
  p: number | null;
  second: string;
  prefill: string;
  audience: string | null;
}

const NEAR = 0.15;
const usd = (chars: number) => (chars / 4) * 0.042e-6;
const fixed = (p: number | null) => (p === null ? "?" : p.toFixed(2));

export function runnerUp(answers: Answers, pick: string | null): string {
  const probs = Object.entries(answers?.profession?.probabilities ?? {}).filter(([k, v]) => k !== pick && typeof v === "number");
  const [k, v] = probs.sort((a, b) => b[1] - a[1])[0] ?? [];
  return k ? `${k} ${fixed(v ?? null)}` : "-";
}

export function rowOf(site: Site, input: Row["input"], about: string, answers: Answers, error = ""): Row {
  const { key, p } = professionAnswer(answers);
  return { url: site.url, expect: site.expect, input, about, error, key, p, second: runnerUp(answers, key), prefill: professionFrom(answers), audience: choiceOf(answers, "audience", AUDIENCES) };
}

const keyOf = (label: string) => (Object.entries(PROFESSION_PICKS).find(([, v]) => v === label)?.[0] ?? (label ? "other" : ""));

export function report(rows: Row[], min = PROFESSION_MIN): string {
  const asked = rows.filter((r) => r.key);
  const right = asked.filter((r) => r.key === r.expect);
  const prefilled = rows.filter((r) => r.prefill);
  const wrongFill = prefilled.filter((r) => keyOf(r.prefill) !== r.expect);
  const missedFill = rows.filter((r) => !r.prefill && r.expect !== "other" && r.key === r.expect);
  const near = asked.filter((r) => r.key !== "other" && r.p !== null && Math.abs(r.p - min) <= NEAR + 1e-9);
  const line = (r: Row) => `| ${r.url} | ${r.expect} | ${r.key ?? "-"} ${fixed(r.p)} | ${r.second} | ${r.prefill || "-"} | ${r.input}${r.error ? `: ${r.error}` : ""} |`;
  return [
    "# brand-dna profession pick, shadow run",
    "",
    `${rows.length} sites, ${asked.length} answered by Jev. Jev's pick matches the label on ${right.length} of ${asked.length}.`,
    `At the cut (${min}): ${prefilled.length} would prefill the work step, ${wrongFill.length} of them wrong. ${missedFill.length} right picks fall under the cut.`,
    "",
    `## Wrong prefills (${wrongFill.length})`,
    "",
    ...(wrongFill.length ? wrongFill.map((r) => `- ${r.url}: label ${r.expect}, would prefill "${r.prefill}" (${r.key} ${fixed(r.p)}, next ${r.second})`) : ["None."]),
    "",
    `## Within ${NEAR} of the cut (${near.length})`,
    "",
    ...(near.length ? near.map((r) => `- ${r.url}: ${r.key} ${fixed(r.p)}, label ${r.expect}`) : ["None."]),
    "",
    "## Every site",
    "",
    "| Site | Label | Jev pick | Next | Prefill | Read from |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map(line),
    "",
    "## What Jev read for each site",
    "",
    ...rows.map((r) => `- ${r.url}: ${r.about ? `"${r.about.slice(0, 300)}${r.about.length > 300 ? "..." : ""}"` : "(nothing)"}`),
    "",
  ].join("\n");
}

async function hash(v: unknown): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(v)));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function readOne(site: Site, cache: Record<string, Answers>, write: boolean): Promise<Row> {
  const url = siteUrl(site.url);
  if (!url) return rowOf(site, "none", "", null, "not a web address");
  let html = "";
  let at = url;
  try {
    const page = await fetchCapped(url, 1_000_000, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", AbortSignal.timeout(20_000));
    html = new TextDecoder().decode(page.bytes);
    at = page.url;
  } catch (e) {
    return rowOf(site, "none", "", null, `didn't open (${e instanceof Error ? e.message : e})`);
  }
  const facts = readSite(html, at);
  const llm = write ? await import("../_shared/openaiChat.ts") : null;
  const written = llm
    ? await llm.openaiChat({ model: llm.OPENAI_MODEL, max_tokens: 700, response_format: WRITE_FORMAT, messages: writeMessages(facts, at.href) }, { signal: AbortSignal.timeout(40_000) })
      .then(async (r) => (r.ok ? parseWritten((await r.json())?.choices?.[0]?.message?.content) : null))
      .catch(() => null)
    : null;
  const about = aboutText(written, facts.description);
  if (!about) return rowOf(site, "none", "", null, "no words to read");
  const state = { text: about };
  const questions = { audience: audienceAsk, profession: professionAsk };
  const k = await hash({ state, questions });
  if (!(k in cache) || cache[k] === null) cache[k] = await askJev(state, questions, { who: `profession-shadow ${at.hostname}`, timeoutMs: 15_000 });
  return rowOf(site, written ? "written" : "description", about, cache[k], cache[k] ? "" : "Jev didn't answer");
}

async function main() {
  const args = Deno.args;
  const outAt = args.indexOf("--out");
  const out = outAt >= 0 ? args[outAt + 1] : `${Deno.env.get("TMPDIR") ?? "/tmp"}/profession-shadow`;
  const sites = JSON.parse(await Deno.readTextFile(new URL("./fixtures/profession-sites.json", import.meta.url))) as Site[];
  const write = !!Deno.env.get("OPENAI_API_KEY") && !args.includes("--no-write");
  const perAsk = JSON.stringify({ audience: audienceAsk, profession: professionAsk }).length + 1500;
  console.log(`${sites.length} sites, one Jev call each, about US$${usd(perAsk * sites.length).toFixed(4)} for Jev${write ? ", plus one OpenAI call each, as a live read makes" : ", reading each site's description only (set OPENAI_API_KEY to read them as a live read does)"}.`);
  if (!args.includes("--go")) return console.log("Add --go to read the sites and ask Jev. Needs TYPESAFE_API_KEY.");
  if (!Deno.env.get("TYPESAFE_API_KEY")) throw new Error("TYPESAFE_API_KEY is not set.");
  await Deno.mkdir(out, { recursive: true });
  const cacheAt = `${out}/answers.json`;
  const cache: Record<string, Answers> = await Deno.readTextFile(cacheAt).then(JSON.parse).catch(() => ({}));
  const queue = sites.map((s, i) => ({ s, i }));
  const rows: Row[] = [];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) rows[next.i] = await readOne(next.s, cache, write);
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  await Deno.writeTextFile(cacheAt, JSON.stringify(cache, null, 1));
  const text = report(rows);
  await Deno.writeTextFile(`${out}/profession-shadow.md`, text);
  await Deno.writeTextFile(`${out}/profession-shadow.json`, JSON.stringify(rows, null, 1));
  console.log(text);
  console.log(`Written to ${out}/profession-shadow.md and profession-shadow.json.`);
}

if ((import.meta as { main?: boolean }).main) await main();
