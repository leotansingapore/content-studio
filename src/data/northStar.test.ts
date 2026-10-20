import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { leoOnly } from "@/lib/leoOnly";
import { SECTIONS, visiblePages } from "@/lib/nav";
import {
  NS_AREAS,
  NS_AREA_ORDER,
  NS_ASKS,
  NS_DECISIONS,
  NS_ITEMS,
  NS_PHASES,
  NS_PRINCIPLES,
  NS_SKIP,
  NS_SOURCES,
  NS_THESIS,
  NS_DOGFOOD,
  RECORDINGS,
  parseFrame,
  buildPrompt,
  frameLabel,
  rollup,
} from "./northStar";
import { NS_COMPETITORS, NS_COMPETITOR_CATEGORIES } from "./northStarCompetitors";

const root = new URL("../../", import.meta.url);

describe("north star", () => {
  it("gives every item a unique kebab-case id, because the id is the link anchor and the spec's file name", () => {
    const ids = NS_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, id).toMatch(/^[a-z0-9-]+$/);
  });

  it("puts every item in a real area and phase, with something in each of they, ours and build", () => {
    const phases = new Set(NS_PHASES.map((p) => p.n));
    for (const i of NS_ITEMS) {
      expect(NS_AREAS[i.area], `${i.id}: area`).toBeTruthy();
      expect(phases.has(i.phase), `${i.id}: phase ${i.phase}`).toBe(true);
      expect(i.they.trim() && i.ours.trim() && i.build.trim(), `${i.id}: empty text`).toBeTruthy();
    }
    for (const a of NS_AREA_ORDER) expect(NS_ITEMS.some((i) => i.area === a), `area ${a} has no items`).toBe(true);
    for (const p of NS_PHASES) expect(NS_ITEMS.some((i) => i.phase === p.n), `phase ${p.n} has no items`).toBe(true);
  });

  it("has a spec file for every item", () => {
    for (const i of NS_ITEMS) expect(existsSync(new URL(`docs/north-star/items/${i.id}.md`, root)), i.id).toBe(true);
  });

  it("only links asks, competitors and frames that exist", () => {
    const ids = new Set(NS_ITEMS.map((i) => i.id));
    for (const a of NS_ASKS) for (const id of a.items) expect(ids.has(id), `${a.id} -> ${id}`).toBe(true);
    const comps = new Set(NS_COMPETITORS.map((c) => c.id));
    for (const i of NS_ITEMS) for (const c of i.seenIn) expect(comps.has(c), `${i.id} -> ${c}`).toBe(true);
    const listed = (ref: string) => {
      const p = parseFrame(ref);
      return Boolean(p && p.rec.frames.includes(p.t));
    };
    for (const i of NS_ITEMS) for (const f of i.frames ?? []) expect(listed(f), `${i.id} -> ${f}`).toBe(true);
    for (const p of [...NS_DOGFOOD.fastlane.posts, ...NS_DOGFOOD.ours]) if (p.frame) expect(listed(p.frame), `dogfood ${p.n} -> ${p.frame}`).toBe(true);
    for (const c of NS_COMPETITORS) for (const k of c.categories) expect(NS_COMPETITOR_CATEGORIES).toContain(k);
  });

  it("ships every recording frame it lists, in order, with chapters inside the recording", () => {
    expect(new Set(RECORDINGS.map((r) => r.id)).size).toBe(RECORDINGS.length);
    for (const r of RECORDINGS) {
      for (const f of r.frames) expect(existsSync(new URL(`public/north-star/${r.dir}/${f}.webp`, root)), `${r.id} ${f}`).toBe(true);
      expect([...r.frames].sort()).toEqual(r.frames);
      const last = Number(r.frames[r.frames.length - 1].slice(1));
      for (const c of r.chapters) expect(c.at, `${r.id} chapter ${c.at}`).toBeLessThanOrEqual(last);
    }
    expect(frameLabel("t125")).toBe("2:05");
    expect(frameLabel("review:t013")).toBe("0:13");
    expect(parseFrame("t176")?.rec.id).toBe("tour");
    expect(parseFrame("review:t013")?.rec.id).toBe("review");
    expect(parseFrame("nope:t001")).toBeNull();
    expect(parseFrame("t1")).toBeNull();
  });

  it("holds Fastlane's 28 Activity Tracker posts as the dogfood benchmark", () => {
    expect(NS_DOGFOOD.fastlane.posts.map((p) => p.n)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
    for (const p of NS_DOGFOOD.fastlane.posts) expect(p.hook.trim(), `post ${p.n}`).not.toBe("");
    // every slide of ours is a file the page can show, and a run with posts says what it found
    for (const p of NS_DOGFOOD.ours) for (const f of p.slides ?? []) expect(existsSync(new URL(`public${f}`, root)), f).toBe(true);
    if (NS_DOGFOOD.ours.length) expect(NS_DOGFOOD.results.length).toBeGreaterThan(0);
  });

  it("counts statuses", () => {
    const r = rollup(NS_ITEMS);
    expect(r.live + r.partial + r.missing).toBe(NS_ITEMS.length);
  });

  it("writes a build prompt that names the item's spec and the gate", () => {
    const p = buildPrompt(NS_ITEMS[0]);
    expect(p).toContain(`docs/north-star/items/${NS_ITEMS[0].id}.md`);
    expect(p).toContain("leoOnly");
  });

  it("is plain ASCII, with no em dashes or smart quotes", () => {
    const text = JSON.stringify([NS_THESIS, NS_PRINCIPLES, NS_AREAS, NS_PHASES, NS_ASKS, NS_ITEMS, NS_DECISIONS, NS_SKIP, NS_SOURCES, RECORDINGS, NS_DOGFOOD, NS_COMPETITORS]);
    expect(text).not.toMatch(/[^\x00-\x7f]/);
  });

  it("shows the page and its nav entry to Leo's sign-ins only", () => {
    expect(leoOnly("tanjunsing@gmail.com")).toBe(true);
    expect(leoOnly(" LeoTanJS95@gmail.com ")).toBe(true);
    expect(leoOnly("user@demo.com")).toBe(false);
    expect(leoOnly(null)).toBe(false);
    const home = SECTIONS.find((s) => s.id === "home")!.pages;
    expect(visiblePages(home, "tanjunsing@gmail.com").map((p) => p.to)).toContain("/north-star");
    expect(visiblePages(home, "someone@example.com").map((p) => p.to)).not.toContain("/north-star");
  });
});
