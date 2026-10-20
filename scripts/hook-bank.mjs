// Hook bank: the real opening lines behind /swipe's Hooks tab (remix-patterns part B), filed under Write's
// 21 hook formulas (src/lib/hookFormulas.ts) with what makes each one stop the scroll (PSYCHOLOGY in
// supabase/functions/_shared/tags.ts). Writes src/data/hookBank.json.
//
// It reads src/data/topPosts.json (the weekly top-posts drop) and keeps the posts that did at least their
// creator's usual: engagement (likes + 3x comments) against the creator's own average in the drop, the same
// ratio /swipe shows. Each one's first sentence, cut to 140 characters, goes to Jev (jev-1.13.0) with two
// Choice questions: which formula it follows (kept at 0.4, since 22 options spread the probability) and why
// it works (0.5). A line whose formula is unsure or "none" is left out. Each formula's own example gets the
// "why it works" question too, for the formula cards. It prints how many it will send before it sends any.
//
// No TYPESAFE_API_KEY: exits 0 and leaves hookBank.json as it is. Jev answering nothing, or no lines to ask
// about: exits 1 and writes nothing, so a bad week never empties the bank.
//
// Usage: TYPESAFE_API_KEY=... node scripts/hook-bank.mjs
// Weekly on Leo's Mac after the top-posts refresh (content-studio-drop.sh top-posts runs it as EXTRA and
// commits src/data/hookBank.json with topPosts.json).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOOK_FORMULAS } from "../src/lib/hookFormulas.ts";
import { askJev } from "../supabase/functions/_shared/jev.ts";
import { PSYCHOLOGY, pickTag } from "../supabase/functions/_shared/tags.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOP_POSTS = path.join(ROOT, "src/data/topPosts.json");
const OUT = path.join(ROOT, "src/data/hookBank.json");
/** Jev's formula pick is kept at this probability or more (a proposal until the first real run is read). */
export const FORMULA_MIN = 0.4;
export const MAX_TEXT = 140;
const FORMULA_IDS = HOOK_FORMULAS.map((f) => f.id);
const PSYCHOLOGY_IDS = PSYCHOLOGY.map((p) => p.id);

export const QUESTIONS = {
  formula: {
    type: "choice",
    instructions: "Which hook formula does the opening line of this post follow?",
    criteria: {
      ...Object.fromEntries(HOOK_FORMULAS.map((f) => [f.id, `${f.name}: ${f.template}`])),
      none: "None of these, or there is no clear opening line.",
    },
  },
  psychology: {
    type: "choice",
    instructions: "What makes this opening line stop someone scrolling past?",
    criteria: Object.fromEntries(PSYCHOLOGY.map((p) => [p.id, p.meaning])),
  },
};

// Mirrors engagementScore in src/lib/topPosts.ts and outperformance in src/lib/postInsights.ts.
const engagement = (p) => (Number(p?.likes) || 0) + (Number(p?.comments) || 0) * 3;

/** The format a top post shows as, read from both Instagram type fields. */
const formatOf = (p) => {
  const t = `${p?.productType ?? ""} ${p?.type ?? ""}`.toLowerCase();
  return /clips|video|igtv/.test(t) ? "short-video" : /sidecar|carousel/.test(t) ? "carousel" : "text-post";
};

/** A caption's first sentence, cut at a word to MAX_TEXT characters. */
export function openingLine(caption) {
  const text = String(caption ?? "").replace(/\s+/g, " ").trim();
  const first = text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text;
  return first.length <= MAX_TEXT ? first : `${first.slice(0, MAX_TEXT - 3).replace(/\s+\S*$/, "")}...`;
}

/** Every top post at its creator's usual or better that has an opening line, best ratio first. */
export function hookLines(topPosts) {
  const lines = [];
  for (const [handle, posts] of Object.entries(topPosts ?? {})) {
    if (!Array.isArray(posts) || !posts.length) continue;
    const usual = posts.reduce((n, p) => n + engagement(p), 0) / posts.length;
    for (const p of posts) {
      const ratio = usual > 0 ? engagement(p) / usual : 1;
      const text = openingLine(p?.caption);
      if (ratio < 1 || !text || !p.shortCode || !p.url) continue;
      lines.push({
        id: p.shortCode,
        text,
        caption: String(p.caption).slice(0, 240),
        from: `@${handle}`,
        ratio: Math.round(ratio * 10) / 10,
        url: p.url,
        format: formatOf(p),
      });
    }
  }
  return lines.sort((a, b) => b.ratio - a.ratio);
}

/**
 * The bank, or null when Jev answered nothing. `ask(state, questions)` is askJev's shape (answers or null).
 */
export async function buildHookBank(topPosts, ask, fetched) {
  const lines = hookLines(topPosts);
  const calls = [
    ...HOOK_FORMULAS.map((f) => [{ opening_line: f.example }, { psychology: QUESTIONS.psychology }]),
    ...lines.map((l) => [{ opening_line: l.text, caption: l.caption, format: l.format }, QUESTIONS]),
  ];
  console.log(`hook-bank: asking Jev about ${lines.length} lines and ${HOOK_FORMULAS.length} formulas (${calls.length} calls)`);
  const answers = new Array(calls.length).fill(null);
  // shortcut: a local 6-at-a-time loop like sg-feeds'; switch to a shared pool if scripts get one
  let next = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < calls.length) {
        const k = next++;
        answers[k] = await ask(...calls[k]);
      }
    }),
  );
  if (answers.every((a) => a == null)) return null;

  const n = HOOK_FORMULAS.length;
  const formulas = Object.fromEntries(HOOK_FORMULAS.map((f, k) => [f.id, pickTag(answers[k]?.psychology, PSYCHOLOGY_IDS)]));
  const hooks = lines
    .map((l, k) => ({
      id: l.id,
      text: l.text,
      formula: pickTag(answers[n + k]?.formula, FORMULA_IDS, FORMULA_MIN),
      psychology: pickTag(answers[n + k]?.psychology, PSYCHOLOGY_IDS),
      from: l.from,
      ratio: l.ratio,
      url: l.url,
      format: l.format,
    }))
    .filter((h) => h.formula);
  return { fetched, formulas, hooks };
}

/** One run; returns the exit code. Jev comes in as `ask` so tests can fake it. */
export async function run({ env = process.env, ask, input = TOP_POSTS, out = OUT, today = new Date().toISOString().slice(0, 10) } = {}) {
  if (!env.TYPESAFE_API_KEY) {
    console.log("hook-bank: no TYPESAFE_API_KEY, so hookBank.json keeps its last drop");
    return 0;
  }
  const topPosts = JSON.parse(fs.readFileSync(input, "utf8"));
  if (!hookLines(topPosts).length) {
    console.error("hook-bank: no top post did its creator's usual; keeping the last hookBank.json");
    return 1;
  }
  const jevEnv = { get: (name) => env[name] };
  const bank = await buildHookBank(
    topPosts,
    ask ?? ((state, questions) => askJev(state, questions, { who: "cs-hook-bank" }, { env: jevEnv })),
    today,
  );
  if (!bank) {
    console.error("hook-bank: Jev answered nothing; keeping the last hookBank.json");
    return 1;
  }
  fs.writeFileSync(out, JSON.stringify(bank, null, 2) + "\n");
  console.log(`hook-bank: ${bank.hooks.length} hooks under ${new Set(bank.hooks.map((h) => h.formula)).size} formulas -> ${out}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = await run();
}
