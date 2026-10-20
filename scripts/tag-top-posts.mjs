// Jev's tags on the weekly top posts (docs/north-star/items/find-ai-tagging.md): the same five questions a saved
// post gets (hook formula, angle, topic, feeling, audience; tagQuestions in supabase/functions/remix/teardown.ts),
// asked once per post about its opening line and caption, and written onto src/data/topPosts.json as
// tags: { formula, angle, topic, emotion, audience, p }. Picks are kept with their probability; the cut is applied
// where they are read (sureTag), so it can move without asking again. No OpenAI: the posts already have `idea`.
//
// Posts that already have tags are skipped, so after the first week it asks only about new posts. It prints how many
// it will ask about before it asks. No TYPESAFE_API_KEY: writes nothing and exits 0, and /swipe keeps its keyword rules.
// Jev answering nothing: writes nothing and exits 0 (a bad week never blocks the drop; next week asks again).
//
// --compare: then prints, for every tagged post, the keyword rules' topic and angle (postLabels.ts) beside Jev's with
// its probability, and counts the disagreements. Read every one before turning Jev's labels on (enrich's useTags).
//
// Usage: TYPESAFE_API_KEY=... node scripts/tag-top-posts.mjs [--compare]
// Weekly: scripts/refresh-top-posts.mjs runs it after gen-ideas.mjs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOOK_FORMULAS } from "../src/lib/hookFormulas.ts";
import { deriveAngle, deriveTopic } from "../src/lib/postLabels.ts";
import { askJev } from "../supabase/functions/_shared/jev.ts";
import { TAG_CUT, readTags, tagQuestions } from "../supabase/functions/remix/teardown.ts";
import { openingLine } from "./hook-bank.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOP_POSTS = path.join(ROOT, "src/data/topPosts.json");
const ADVISORS = path.join(ROOT, "src/data/advisors.json");
const FORMULAS = HOOK_FORMULAS.map(({ id, template }) => ({ id, template }));
const FORMULA_IDS = FORMULAS.map((f) => f.id);
const QUESTIONS = tagQuestions(FORMULAS);

/** What Jev reads for one post: the state teardown's tags call uses, from the caption alone. */
export const stateOf = (p) => ({ hook: openingLine(p.caption), post: String(p.caption).slice(0, 2000) });

/** Tags every untagged post with a caption, in place. `ask(state, questions)` is askJev's shape (answers or null). */
export async function tagTopPosts(topPosts, ask) {
  const all = Object.values(topPosts ?? {}).flatMap((list) => (Array.isArray(list) ? list : []));
  const todo = all.filter((p) => !p.tags && String(p.caption ?? "").trim());
  console.log(`tag-top-posts: asking Jev about ${todo.length} posts (${all.length - todo.length} already tagged or with no caption)`);
  const answers = new Array(todo.length).fill(null);
  // shortcut: a local 6-at-a-time loop like hook-bank's; switch to a shared pool if scripts get one
  let next = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < todo.length) {
        const k = next++;
        answers[k] = await ask(stateOf(todo[k]), QUESTIONS);
      }
    }),
  );
  let tagged = 0;
  todo.forEach((p, k) => {
    if (!answers[k]) return;
    const { by: _by, ...tags } = readTags(answers[k], FORMULA_IDS);
    p.tags = tags;
    tagged++;
  });
  return { asked: todo.length, tagged };
}

/** Every tagged post's keyword-rule topic and angle beside Jev's, with the disagreements counted. */
export function compare(topPosts, advisors = []) {
  const niche = Object.fromEntries(advisors.filter((a) => a.platform === "instagram").map((a) => [a.handle.replace("@", "").toLowerCase(), a.niche ?? []]));
  const rows = [];
  for (const [handle, posts] of Object.entries(topPosts ?? {})) {
    for (const p of Array.isArray(posts) ? posts : []) {
      if (!p.tags) continue;
      const text = `${p.idea?.hook ?? ""} ${p.caption ?? ""}`;
      const side = (field, rule) => {
        const jev = p.tags[field] ?? null;
        const prob = p.tags.p?.[field] ?? null;
        return { rule: rule ?? null, jev, p: prob, differs: (rule ?? null) !== jev, sure: jev !== null && (prob ?? 0) >= TAG_CUT[field] };
      };
      rows.push({ id: `@${handle} ${p.shortCode}`, topic: side("topic", deriveTopic(text, niche[handle] ?? [])), angle: side("angle", deriveAngle(text)) });
    }
  }
  const count = (field) => ({ differs: rows.filter((r) => r[field].differs).length, sureDiffers: rows.filter((r) => r[field].differs && r[field].sure).length });
  return { rows, topic: count("topic"), angle: count("angle") };
}

function printCompare(c) {
  const cell = (s) => `${s.rule ?? "-"} | jev ${s.jev ?? "-"}${s.p === null ? "" : ` (${s.p})`}${s.differs ? " *" : ""}`;
  for (const r of c.rows) console.log(`${r.id}  topic ${cell(r.topic)}  angle ${cell(r.angle)}`);
  for (const f of ["topic", "angle"]) {
    console.log(`${f}: ${c[f].differs} of ${c.rows.length} disagree (* above), ${c[f].sureDiffers} of them with Jev at or above the ${TAG_CUT[f]} cut`);
  }
}

/** One run; returns the exit code. Jev comes in as `ask` so tests can fake it. */
export async function run({ env = process.env, ask, input = TOP_POSTS, advisors = ADVISORS, argv = process.argv.slice(2) } = {}) {
  const topPosts = JSON.parse(fs.readFileSync(input, "utf8"));
  if (!env.TYPESAFE_API_KEY) {
    console.log("tag-top-posts: no TYPESAFE_API_KEY, so topPosts.json keeps its tags and /swipe its keyword rules");
  } else {
    const jevEnv = { get: (name) => env[name] };
    const { asked, tagged } = await tagTopPosts(topPosts, ask ?? ((state, questions) => askJev(state, questions, { who: "cs-tag-top-posts" }, { env: jevEnv })));
    if (tagged) {
      fs.writeFileSync(input, JSON.stringify(topPosts, null, 2) + "\n");
      console.log(`tag-top-posts: tagged ${tagged} of ${asked} -> ${input}`);
    } else if (asked) console.error("tag-top-posts: Jev answered nothing; topPosts.json left as it was");
  }
  if (argv.includes("--compare")) printCompare(compare(topPosts, JSON.parse(fs.readFileSync(advisors, "utf8"))));
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = await run();
}
