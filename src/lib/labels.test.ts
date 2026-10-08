import { beforeEach, describe, expect, it } from "vitest";
import { loadDrafts, saveDrafts, upsertDraft, type DraftEntry } from "./draftHistory";
import { addLabel, deleteLabel, labelMix, loadLabels, seedLabels, setDraftLabels, updateLabel, type Label } from "./labels";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
let mem: MemStorage;

const post = (id: string, extra: Partial<DraftEntry> = {}): DraftEntry => ({
  id, createdAt: "2026-10-01T00:00:00.000Z", hook: id, draft: "", pillar: "", pillarDetail: "", audience: "", format: "", platform: "linkedin", ctaType: "", ...extra,
});

beforeEach(() => {
  mem = new MemStorage();
  (globalThis as { window?: unknown }).window = { localStorage: mem };
});

describe("labels store", () => {
  it("seeds from positioning topics without writing until a post uses one", () => {
    mem.setItem(`content-studio-positioning-${UID}`, JSON.stringify({ topics: ["CPF", "Retirement planning", "cpf"] }));
    expect(seedLabels(["CPF", "Retirement planning", "cpf"]).map((l) => [l.id, l.color])).toEqual([["t-cpf", "primary"], ["t-retirement-planning", "brand"]]);
    expect(loadLabels(UID).map((l) => l.name)).toEqual(["CPF", "Retirement planning"]);
    expect(mem.getItem(`content-studio-labels-${UID}`)).toBeNull();
    saveDrafts(UID, [post("a")]);
    setDraftLabels(UID, "a", ["t-cpf"]);
    expect(JSON.parse(mem.getItem(`content-studio-labels-${UID}`)!)).toHaveLength(2);
  });

  it("adds with the next unused colour and refuses a blank or taken name", () => {
    const first = addLabel(UID, " Recruitment ")!;
    expect(first.label).toMatchObject({ name: "Recruitment", color: "primary" });
    expect(addLabel(UID, "recruitment")).toBeNull();
    expect(addLabel(UID, "   ")).toBeNull();
    expect(addLabel(UID, "Family")!.label.color).toBe("brand");
  });

  it("renames and recolours, ignoring a clash", () => {
    const a = addLabel(UID, "A")!.label;
    addLabel(UID, "B");
    expect(updateLabel(UID, a.id, { name: "b", color: "success" }).find((l) => l.id === a.id)).toMatchObject({ name: "A", color: "success" });
    expect(updateLabel(UID, a.id, { name: "Alpha" }).find((l) => l.id === a.id)!.name).toBe("Alpha");
  });

  it("deleting a label takes it off every post", () => {
    const a = addLabel(UID, "A")!.label;
    const b = addLabel(UID, "B")!.label;
    saveDrafts(UID, [post("x", { labels: [a.id, b.id] }), post("y", { labels: [a.id] }), post("z")]);
    const { labels, drafts } = deleteLabel(UID, a.id);
    expect(labels.map((l) => l.id)).toEqual([b.id]);
    expect(drafts.map((d) => d.labels)).toEqual([[b.id], undefined, undefined]);
    expect(loadDrafts(UID)[1]).not.toHaveProperty("labels");
  });

  it("an edit from Write keeps the post's labels", () => {
    saveDrafts(UID, [post("x", { labels: ["l1"] })]);
    upsertDraft(UID, post("x", { hook: "edited" }));
    expect(loadDrafts(UID)[0]).toMatchObject({ hook: "edited", labels: ["l1"] });
  });
});

describe("labelMix", () => {
  const NOW = Date.parse("2026-10-08T12:00:00Z");
  const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
  const L: Label[] = [
    { id: "a", name: "A", color: "primary" },
    { id: "b", name: "B", color: "brand" },
    { id: "c", name: "C", color: "success" },
  ];
  const posts = [
    post("1", { status: "posted", postedAt: ago(1), labels: ["a"] }),
    post("2", { status: "posted", postedAt: ago(2), labels: ["a", "b"] }),
    post("3", { status: "posted", postedAt: ago(3), labels: ["gone"] }),
    post("4", { status: "posted", postedAt: ago(40), labels: ["c"] }),
    post("5", { status: "scheduled", scheduledFor: "2026-10-09", labels: ["c"] }),
  ];

  it("counts label uses among posts that went out in the window, with equal targets by default", () => {
    const m = labelMix(posts, L, 30, NOW);
    expect(m.posts).toBe(3);
    expect(m.unlabelled).toBe(1);
    expect(m.rows.map((r) => [r.label.id, r.count, r.share, r.target])).toEqual([
      ["a", 2, 67, 33],
      ["b", 1, 33, 33],
      ["c", 0, 0, 33],
    ]);
  });

  it("uses all time for 0 and turns set targets into shares", () => {
    const m = labelMix(posts, [{ ...L[0], target: 50 }, { ...L[1], target: 25 }, { ...L[2], target: 25 }], 0, NOW);
    expect(m.posts).toBe(4);
    expect(m.rows.map((r) => r.target)).toEqual([50, 25, 25]);
    expect(labelMix(posts, [{ ...L[0], target: 2 }, { ...L[1], target: 1 }, { ...L[2], target: 1 }], 0, NOW).rows.map((r) => r.target)).toEqual([50, 25, 25]);
  });
});
