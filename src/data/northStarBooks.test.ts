// The two postmosis.com plan pages, /seo-north-star and /marketing-north-star/postmosis, hold the same rules as the
// hub (marketingNorthStar.test.ts): anchors, areas and phases that exist, a spec in step with each card, no private
// facts, plain ASCII. The repo is public and this data ships in a public JS chunk, gate or no gate.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rollupMk, type MkAsk } from "./marketingNorthStar";
import * as seo from "./seoNorthStar";
import * as pm from "./postmosisMarketingNorthStar";

const root = new URL("../../", import.meta.url);

// The shapes of facts that never belong here: email addresses, Supabase project refs (the two we run, and any
// <20 letters>.supabase.co), Meta ad account ids, Stripe ids, UUIDs, long numeric ids, and counts of our own
// customers, trials or sign-ups. A rule is written in words ("once ten customers agree"), which none of these match.
// X post ids (after status/) and migration timestamps (20YYMMDDhhmmss) are public and allowed.
const PRIVATE: RegExp[] = [
  /[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}/i,
  /hgdbflprrficdoyxmdxe|ktxwcxderiomxzfcezmh|\b[a-z]{20}\.supabase\.co\b/,
  /\bact_\d+/,
  /\b(?:cus|sub|acct|price|prod|pi|cs|pm|seq)_[A-Za-z0-9]{8,}/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  /(?<!status\/)\b(?!20\d{12}\b)\d{12,}\b/,
  /\b\d[\d,]*\s+(?:real |paying |active |new |trial )?(?:customers?|trials?|sign-?ups?)\b/i,
];

interface Item {
  id: string;
  area: string;
  title: string;
  status: "done" | "started" | "todo";
  phase: number;
  owner: string;
  why: string;
  ours: string;
  build: string;
  question?: string;
}

const BOOKS = [
  {
    name: "postmosis.com SEO",
    dir: "docs/seo-north-star/",
    data: "src/data/seoNorthStar.ts",
    research: ["research/census.md", "research/census.json"],
    prefix: /^pm-seo-[a-z0-9-]+$/,
    items: seo.SEO_ITEMS as Item[],
    areas: seo.SEO_AREAS as Record<string, unknown>,
    areaOrder: seo.SEO_AREA_ORDER as string[],
    phases: seo.SEO_PHASES,
    asks: seo.SEO_ASKS as MkAsk[],
    decisions: seo.SEO_DECISIONS,
    rest: [seo.SEO_SKIP, seo.SEO_THESIS, seo.SEO_PRINCIPLES, seo.SEO_SOURCES, seo.SEO_TARGETS],
    prompt: seo.seoBuildPrompt,
    specUrl: seo.seoSpecUrl,
  },
  {
    name: "postmosis.com marketing",
    dir: "docs/marketing-north-star/postmosis/",
    data: "src/data/postmosisMarketingNorthStar.ts",
    research: ["research/teardown.md"],
    prefix: /^pm-mk-[a-z0-9-]+$/,
    items: pm.PM_ITEMS as Item[],
    areas: pm.PM_AREAS as Record<string, unknown>,
    areaOrder: pm.PM_AREA_ORDER as string[],
    phases: pm.PM_PHASES,
    asks: pm.PM_ASKS,
    decisions: pm.PM_DECISIONS,
    rest: [pm.PM_SKIP, pm.PM_THESIS, pm.PM_PRINCIPLES, pm.PM_SOURCES],
    prompt: pm.pmBuildPrompt,
    specUrl: pm.pmSpecUrl,
  },
];

describe.each(BOOKS)("$name north star", (b) => {
  const specDir = new URL(`${b.dir}items/`, root);
  const spec = (id: string) => readFileSync(new URL(`${id}.md`, specDir), "utf8");
  const data = JSON.stringify([b.items, b.asks, b.decisions, b.phases, b.areas, ...b.rest]);

  it("gives every card a unique id that no decision or section anchor reuses", () => {
    const ids = b.items.map((i) => i.id);
    const anchors = [...ids, ...b.decisions.map((d) => d.id), "asks", "how-we-work", "build-order", "plan", "decisions", "leave-out", "sources"];
    expect(new Set(anchors).size).toBe(anchors.length);
    for (const id of ids) expect(id, id).toMatch(b.prefix);
  });

  it("puts every card in a real area and phase, with something in each of why, ours and build", () => {
    const phases = new Set(b.phases.map((p) => p.n));
    for (const i of b.items) {
      expect(b.areas[i.area], `${i.id}: area`).toBeTruthy();
      expect(phases.has(i.phase), `${i.id}: phase ${i.phase}`).toBe(true);
      expect(i.why.trim() && i.ours.trim() && i.build.trim(), `${i.id}: empty text`).toBeTruthy();
    }
    for (const a of b.areaOrder) expect(b.items.some((i) => i.area === a), `area ${a} has no cards`).toBe(true);
    for (const p of b.phases) expect(b.items.some((i) => i.phase === p.n), `phase ${p.n} has no cards`).toBe(true);
  });

  it("lists cards phase by phase, so Next up is the first open card of the earliest phase", () => {
    const phases = b.items.map((i) => i.phase);
    expect(phases).toEqual([...phases].sort((x, y) => x - y));
  });

  it("only links asks and decisions to cards that exist", () => {
    const ids = new Set(b.items.map((i) => i.id));
    for (const a of b.asks) for (const id of a.items) expect(ids.has(id), `${a.id} -> ${id}`).toBe(true);
    for (const d of b.decisions) {
      expect(d.items.length, d.id).toBeGreaterThan(0);
      for (const id of d.items) expect(ids.has(id), `${d.id} -> ${id}`).toBe(true);
    }
  });

  it("has a spec for every card and no spec without a card, plus the brief, Leo's words and the research", () => {
    const ids = new Set(b.items.map((i) => i.id));
    for (const id of ids) expect(existsSync(new URL(`${id}.md`, specDir)), id).toBe(true);
    for (const f of readdirSync(specDir)) expect(ids.has(f.replace(/\.md$/, "")), f).toBe(true);
    for (const f of ["README.md", "leo.md", ...b.research]) expect(existsSync(new URL(`${b.dir}${f}`, root)), f).toBe(true);
  });

  it("keeps each spec's title, status, owner and phase in step with its card", () => {
    for (const i of b.items) {
      const md = spec(i.id);
      const phase = b.phases.find((p) => p.n === i.phase)!;
      expect(md.split("\n")[0], `${i.id}: title`).toBe(`# ${i.title}`);
      expect(md, `${i.id}: status`).toContain(`\nStatus: ${i.status}\n`);
      expect(md, `${i.id}: owner and phase`).toContain(`owner ${i.owner}, phase ${i.phase} (${phase.title}).`);
      for (const s of ["## Why", "## What we have today", "## What to do", "## Done when", "## Open questions"]) expect(md, `${i.id}: ${s}`).toContain(s);
    }
  });

  it("keeps private facts out of the data, the specs and the briefs", () => {
    for (const p of PRIVATE) expect(data, String(p)).not.toMatch(p);
    const docs = [...readdirSync(specDir).map((f) => new URL(f, specDir)), new URL(`${b.dir}README.md`, root), new URL(`${b.dir}leo.md`, root)];
    for (const f of docs) {
      const text = readFileSync(f, "utf8");
      for (const p of PRIVATE) expect(text, `${f.pathname} ${p}`).not.toMatch(p);
    }
  });

  it("writes the data and the specs in plain ASCII, with no em or en dashes", () => {
    expect(data).toMatch(/^[\x20-\x7e]*$/);
    for (const i of b.items) expect(spec(i.id), i.id).toMatch(/^[\t\n -~]*$/);
  });

  it("writes a prompt that points a session at the card's spec and back at the data file", () => {
    const first = b.items[0];
    expect(b.prompt(first)).toContain(`${b.dir}items/${first.id}.md`);
    expect(b.prompt(first)).toContain(b.data);
    expect(b.specUrl(first.id)).toBe(`https://github.com/leotansingapore/content-studio/blob/main/${b.dir}items/${first.id}.md`);
  });

  it("counts every card once", () => {
    const r = rollupMk(b.items);
    expect(r.done + r.started + r.todo).toBe(b.items.length);
  });
});

describe("the private-fact guard", () => {
  it("bites on each shape it exists for, and lets rules and public ids through", () => {
    const leaks = ["write to someone@example.com", "hgdbflprrficdoyxmdxe", "act_123456789", "cus_Abc12345XYZ", "0a1b2c3d-1111-2222-3333-444455556666", "account 123456789012", "4 trials, 0 cards", "about 16 customers"];
    for (const leak of leaks) expect(PRIVATE.some((p) => p.test(leak)), leak).toBe(true);
    for (const fine of ["once ten customers agree", "x.com/a/status/2100584306334966262", "20260619123456", "30,000 users", "the first 20 professionals"]) {
      expect(PRIVATE.some((p) => p.test(fine)), fine).toBe(false);
    }
  });
});

describe("the hub links the postmosis.com page", () => {
  it("lists it with the other app pages, opening in this app", async () => {
    const { MK_APP_PAGES } = await import("./marketingNorthStar");
    expect(MK_APP_PAGES.find((p) => p.app === "postmosis")).toMatchObject({ url: "/marketing-north-star/postmosis", live: true });
  });
});
