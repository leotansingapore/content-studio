// The remix fit check's shadow run (docs/north-star/items/remix-fit-check.md): asks Jev the fit questions for every
// source in the weekly drops (the top posts, ads and trends in src/data) against each of Leo's brands, puts each
// answer beside today's "Best for you" logic (personalMatch in src/lib/postInsights.ts, top posts only) and prints
// every case where the two disagree, plus the 30 lowest and 30 highest `serves` per brand. Read every one of them,
// then set FIT_AT in supabase/functions/remix/logic.ts and date its comment. It changes nothing anywhere.
//
// It loads the app's own modules through Vite (the "@/" alias, the JSON drops), so the sources and the fit
// questions are exactly the ones the app sends, and asks Jev with the edge functions' own helper (jev-1.13.0).
//
// Brands, read-only, from either:
//   a JSON file:  [{ "name": "MoneyBees", "positioning": { "oneLiner": "", "audience": "young-adult",
//                    "audienceDetail": "", "topics": ["CPF"] } }, ...]   (Leo exports it, or types it)
//   or SUPABASE_SERVICE_ROLE_KEY: Leo's synced rows in cs_user_data under his two uids (profiles, brand kits and
//     positioning), read with a GET and never written.
//
// Usage:
//   node scripts/fit-shadow.mjs brands.json            # prints the counts and the cost, then stops
//   node scripts/fit-shadow.mjs brands.json --go       # asks Jev: about 167 calls, under US$0.01, a brand
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/fit-shadow.mjs --go
//   --out report.json writes every answer (default: fit-shadow-report.json in the system temp folder)
// Needs TYPESAFE_API_KEY for --go. Stops before any call when a brand would take more than 200.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEO = ["13b28b1d-2ecb-40be-b3a9-aefc90366f9b", "40f07a18-b087-4c95-ba1f-d5444222968a"];
const SUPABASE_URL = "https://hgdbflprrficdoyxmdxe.supabase.co";
const MAX_PER_BRAND = 200;
const PARALLEL = 4;
const USD_PER_CALL = 0.00007; // about 1,500 input tokens at US$0.042 a million (Jev), rounded up

const args = process.argv.slice(2);
const go = args.includes("--go");
const outAt = args.indexOf("--out");
const OUT = outAt >= 0 ? args[outAt + 1] : path.join(os.tmpdir(), "fit-shadow-report.json");
const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");

/** The make row's brand block, as remixBrand.ts builds it from a kit name and a positioning. */
export function brandOf(name, p) {
  const audience = [p?.audience && p.audience !== "general" ? p.audience.replace(/-/g, " ") : "", (p?.audienceDetail ?? "").trim()].filter(Boolean).join(": ");
  return { name: (name ?? "").trim(), oneLiner: (p?.oneLiner ?? "").trim(), audience, topics: (p?.topics ?? []).map((t) => String(t).trim()).filter(Boolean) };
}

/** Where Jev and today's logic part ways: Jev says it serves and Best for you scores 0, or the other way round. */
export function disagrees(serves, match) {
  if (serves === null || match === null) return false;
  return (serves >= 0.55 && match === 0) || (serves < 0.55 && match >= 0.5);
}

async function brandsFromRows() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Give a brands JSON file, or set SUPABASE_SERVICE_ROLE_KEY to read Leo's rows.");
  const out = [];
  // only the three key kinds a brand needs: an unfiltered read pulls every draft and kit image and stops at max_rows (1000)
  const keys = encodeURIComponent("(key.like.content-studio-profiles-*,key.like.content-studio-carousel-brand-*,key.like.content-studio-positioning-*)");
  for (const uid of LEO) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/cs_user_data?select=key,data&user_id=eq.${uid}&or=${keys}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`cs_user_data read failed: ${res.status}`);
    const list = await res.json();
    if (list.length >= 1000) throw new Error(`cs_user_data gave ${list.length} rows for ${uid.slice(0, 8)}, so some brands may be missing; stopping.`);
    const rows = Object.fromEntries(list.map((r) => [r.key, r.data]));
    const parse = (k) => {
      try {
        return rows[k] ? JSON.parse(rows[k]) : null;
      } catch {
        return null;
      }
    };
    const profiles = [{ id: "me", name: "Me" }, ...(parse(`content-studio-profiles-${uid}`) ?? []).filter((p) => p?.id && p.id !== "me")];
    for (const pr of profiles) {
      const scope = pr.id === "me" ? uid : `${uid}~${pr.id}`;
      const kit = parse(`content-studio-carousel-brand-${scope}`);
      const positioning = parse(`content-studio-positioning-${scope}`);
      if (!positioning) {
        console.log(`skipped: ${uid.slice(0, 8)} ${pr.name} has no positioning row`);
        continue;
      }
      out.push({ name: kit?.name || (pr.name !== "Me" ? pr.name : ""), positioning, from: `${uid.slice(0, 8)} ${pr.name}` });
    }
  }
  return out;
}

async function main() {
  const brands = file ? JSON.parse(fs.readFileSync(path.resolve(file), "utf8")) : await brandsFromRows();
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@": path.join(ROOT, "src") } },
  });
  try {
    const load = (p) => vite.ssrLoadModule(p);
    const { getAllTopPosts } = await load("/src/lib/topPosts.ts");
    const { ADS } = await load("/src/lib/adsSwipe.ts");
    const { TRENDS } = await load("/src/lib/trends.ts");
    const { fromAd, fromTopPost, fromTrend } = await load("/src/lib/remixSource.ts");
    const { buildCreatorAverages, enrich, personalMatch, personalTargetFromPositioning } = await load("/src/lib/postInsights.ts");
    const { fitQuestions, fitState, fitVerdict } = await load("/supabase/functions/remix/logic.ts");
    const { askJev, noulOf } = await load("/supabase/functions/_shared/jev.ts");

    const posts = getAllTopPosts();
    const averages = buildCreatorAverages(posts);
    const joined = (parts) => parts.map((x) => (x ?? "").trim()).filter(Boolean).join("\n\n").slice(0, 2000);
    // the same words fullText (src/lib/remix.ts) sends for each kind
    const sources = [
      ...posts.map((p) => ({ s: fromTopPost(p, { id: p.advisorId, name: p.advisorName, handle: p.handle }), text: joined([p.caption]), insight: enrich(p, averages) })),
      ...ADS.map((a) => ({ s: fromAd(a), text: joined([a.headline, a.body, a.cta]), insight: null })),
      ...TRENDS.map((t) => ({ s: fromTrend(t), text: joined([t.title, t.why_it_works, ...(t.hooks ?? []), ...(t.talking_points ?? []), t.cta]), insight: null })),
    ].filter((x) => x.text);

    const calls = brands.length * sources.length;
    console.log(`sources: ${posts.length} top posts, ${ADS.length} ads, ${TRENDS.length} trends (${sources.length} with words)`);
    console.log(`brands: ${brands.length} (${brands.map((b) => b.name || b.from || "unnamed").join(", ")})`);
    console.log(`Jev calls: ${calls}, about US$${(calls * USD_PER_CALL).toFixed(3)}`);
    if (sources.length > MAX_PER_BRAND) throw new Error(`${sources.length} sources a brand is over the ${MAX_PER_BRAND} limit; stopping before any call.`);
    if (!go) return console.log("Counts only. Add --go to ask Jev.");
    if (!process.env.TYPESAFE_API_KEY) throw new Error("TYPESAFE_API_KEY is not set.");

    const env = { get: (name) => process.env[name] };
    const report = [];
    for (const b of brands) {
      const brand = brandOf(b.name, b.positioning);
      const target = personalTargetFromPositioning({ oneLiner: "", audience: "general", audienceDetail: "", topics: [], ...b.positioning });
      const rows = [];
      for (let i = 0; i < sources.length; i += PARALLEL) {
        await Promise.all(
          sources.slice(i, i + PARALLEL).map(async ({ s, text, insight }) => {
            const video = s.format === "video" || s.format === "carousel";
            const req = { mode: "fit", source: { key: s.key, kind: s.kind, format: s.format, platform: s.platform, title: s.title, text }, brand, video };
            const answers = await askJev(fitState(req), fitQuestions(video), { who: "fit-shadow" }, { env });
            const n = { serves: noulOf(answers, "serves"), retell: noulOf(answers, "retell"), masSafe: noulOf(answers, "masSafe"), textHeavy: video ? noulOf(answers, "textHeavy") : null };
            rows.push({ key: s.key, title: s.title ?? "", ...n, ...fitVerdict(n), match: insight ? personalMatch(insight, target) : null });
          }),
        );
        process.stdout.write(`\r${brand.name || "unnamed"}: ${rows.length}/${sources.length}`);
      }
      process.stdout.write("\n");
      report.push({ brand, rows });
      const line = (r) => `  ${String(r.serves ?? "-").slice(0, 4).padEnd(4)} match ${String(r.match ?? "-").padEnd(3)} ${r.verdict.padEnd(7)} ${r.reasons.join(",").padEnd(22)} ${r.key}  ${r.title.slice(0, 70)}`;
      const byVerdict = rows.reduce((m, r) => ({ ...m, [r.verdict]: (m[r.verdict] ?? 0) + 1 }), {});
      console.log(`\n== ${brand.name || "unnamed"}: ${JSON.stringify(byVerdict)}`);
      console.log("Disagreements with Best for you (top posts):");
      rows.filter((r) => disagrees(r.serves, r.match)).forEach((r) => console.log(line(r)));
      const known = rows.filter((r) => r.serves !== null).sort((a, b) => a.serves - b.serves);
      console.log("30 lowest serves:");
      known.slice(0, 30).forEach((r) => console.log(line(r)));
      console.log("30 highest serves:");
      known.slice(-30).reverse().forEach((r) => console.log(line(r)));
    }
    fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), report }, null, 2));
    console.log(`\nEvery answer: ${OUT}`);
  } finally {
    await vite.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
