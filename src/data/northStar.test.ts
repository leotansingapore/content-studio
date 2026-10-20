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
  RECORDING,
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
    for (const i of NS_ITEMS) for (const f of i.frames ?? []) expect(RECORDING.frames, `${i.id} -> ${f}`).toContain(f);
    for (const c of NS_COMPETITORS) for (const k of c.categories) expect(NS_COMPETITOR_CATEGORIES).toContain(k);
  });

  it("ships every recording frame it lists, in order", () => {
    for (const f of RECORDING.frames) expect(existsSync(new URL(`public/north-star/fastlane/${f}.webp`, root)), f).toBe(true);
    expect([...RECORDING.frames].sort()).toEqual(RECORDING.frames);
    expect(frameLabel("t125")).toBe("2:05");
    expect(frameLabel("t000")).toBe("0:00");
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
    const text = JSON.stringify([NS_THESIS, NS_PRINCIPLES, NS_AREAS, NS_PHASES, NS_ASKS, NS_ITEMS, NS_DECISIONS, NS_SKIP, NS_SOURCES, RECORDING, NS_COMPETITORS]);
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
