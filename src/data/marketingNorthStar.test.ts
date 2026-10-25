import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MK_APPS,
  MK_AREAS,
  MK_AREA_ORDER,
  MK_ASKS,
  MK_DECISIONS,
  MK_ITEMS,
  MK_PHASES,
  MK_PRINCIPLES,
  MK_SKIP,
  MK_SOURCES,
  MK_THESIS,
  mkBuildPrompt,
  rollupMk,
} from "./marketingNorthStar";

const root = new URL("../../", import.meta.url);
const specDir = new URL("docs/marketing-north-star/items/", root);

// The repo is public and this data ships in a public JS chunk. These are the shapes of the private facts kept in
// ~/Documents/App Growth Playbook/private-notes.md: Meta ad account and Page ids, the amount an affiliate is owed,
// email addresses and the ActivityTracker Supabase project ref. X post ids (after status/) and migration timestamps
// (20YYMMDDhhmmss) are public and allowed.
const PRIVATE = [/act_\d+/, /(?<!status\/)\b(?!20\d{12}\b)\d{12,}\b/, /1,793|4,484/, /[a-z0-9._-]+@[a-z0-9-]+\.[a-z.]+/i, /ktxwcxderiomxzfcezmh/];

describe("marketing north star", () => {
  it("gives every card a unique kebab-case id, because the id is the link anchor and the spec's file name", () => {
    const ids = MK_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, id).toMatch(/^[a-z0-9-]+$/);
  });

  it("puts every card in a real area, phase and app, with something in each of why, ours and build", () => {
    const phases = new Set(MK_PHASES.map((p) => p.n));
    for (const i of MK_ITEMS) {
      expect(MK_AREAS[i.area], `${i.id}: area`).toBeTruthy();
      expect(MK_APPS[i.app], `${i.id}: app`).toBeTruthy();
      expect(phases.has(i.phase), `${i.id}: phase ${i.phase}`).toBe(true);
      expect(i.why.trim() && i.ours.trim() && i.build.trim(), `${i.id}: empty text`).toBeTruthy();
    }
    for (const a of MK_AREA_ORDER) expect(MK_ITEMS.some((i) => i.area === a), `area ${a} has no cards`).toBe(true);
    for (const p of MK_PHASES) expect(MK_ITEMS.some((i) => i.phase === p.n), `phase ${p.n} has no cards`).toBe(true);
  });

  it("lists cards phase by phase, so the page's Next up is the first open card of the earliest phase", () => {
    const phases = MK_ITEMS.map((i) => i.phase);
    expect(phases).toEqual([...phases].sort((a, b) => a - b));
  });

  it("only links asks and decisions to cards that exist", () => {
    const ids = new Set(MK_ITEMS.map((i) => i.id));
    for (const a of MK_ASKS) for (const id of a.items) expect(ids.has(id), `${a.id} -> ${id}`).toBe(true);
    for (const d of MK_DECISIONS) for (const id of d.items) expect(ids.has(id), `${d.id} -> ${id}`).toBe(true);
    expect(new Set(MK_DECISIONS.map((d) => d.id)).size).toBe(MK_DECISIONS.length);
  });

  it("has a spec file for every card and no spec without a card", () => {
    for (const i of MK_ITEMS) expect(existsSync(new URL(`${i.id}.md`, specDir)), i.id).toBe(true);
    const ids = new Set(MK_ITEMS.map((i) => i.id));
    for (const f of readdirSync(specDir)) expect(ids.has(f.replace(/\.md$/, "")), f).toBe(true);
    expect(existsSync(new URL("docs/marketing-north-star/README.md", root))).toBe(true);
    expect(existsSync(new URL("docs/marketing-north-star/leo.md", root))).toBe(true);
  });

  it("keeps private facts out of the public data and specs", () => {
    const data = JSON.stringify([MK_ITEMS, MK_ASKS, MK_DECISIONS, MK_SKIP, MK_THESIS, MK_PRINCIPLES, MK_SOURCES]);
    for (const p of PRIVATE) expect(data, String(p)).not.toMatch(p);
    for (const f of readdirSync(specDir)) {
      const text = readFileSync(new URL(f, specDir), "utf8");
      for (const p of PRIVATE) expect(text, `${f} ${p}`).not.toMatch(p);
    }
  });

  it("writes a prompt that points a session at the card's spec and back at this file", () => {
    const p = mkBuildPrompt(MK_ITEMS[0]);
    expect(p).toContain(`docs/marketing-north-star/items/${MK_ITEMS[0].id}.md`);
    expect(p).toContain("src/data/marketingNorthStar.ts");
  });

  it("counts every card once", () => {
    const r = rollupMk(MK_ITEMS);
    expect(r.done + r.started + r.todo).toBe(MK_ITEMS.length);
  });
});
