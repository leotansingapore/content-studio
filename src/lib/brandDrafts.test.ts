import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keptBrand } from "./addBrand";
import { capDrafts, DRAFTS_PREFIX, draftColour, draftLink, keepForm, keptFor, loadDrafts, MAX_DRAFTS, removeDraft, saveDraft, type BrandDraft } from "./brandDrafts";
import { listMerger } from "./syncMerge";

const UID = "u1";
const LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg";
const dna = {
  url: "https://acme.sg",
  name: "Acme Advisory",
  colour: "#0f766e",
  logo: LOGO,
  handles: { instagram: "acme.sg" },
  oneLiner: "We help young families plan their CPF.",
  audience: "parent",
  audienceDetail: "",
  topics: ["CPF"],
  edge: "",
  voice: "Warm and plain.",
};
// BrandSetup's snapshot, as persist() gets it
const form = (over: Record<string, unknown> = {}) => JSON.stringify({ v: 1, step: "review", address: "https://www.acme.sg/", name: "", justName: false, profession: "Coach", dna, done: ["identity"], colours: ["#0f766e"], ...over });

let store: Map<string, string>;
const mapStorage = (m: Map<string, string>) => ({
  getItem: (k: string) => m.get(k) ?? null,
  setItem: (k: string, v: string) => void m.set(k, v),
  removeItem: (k: string) => void m.delete(k),
});

beforeEach(() => {
  store = new Map();
  vi.stubGlobal("localStorage", mapStorage(store));
});
afterEach(() => vi.unstubAllGlobals());

describe("brand drafts", () => {
  it("live under one synced key per sign-in", () => {
    saveDraft(UID, "d1", form());
    expect(DRAFTS_PREFIX.startsWith("content-studio-")).toBe(true);
    expect([...store.keys()]).toEqual([`${DRAFTS_PREFIX}${UID}`]);
  });

  it("adds a draft with its host, the name from the read, its step and the kept form", () => {
    const [d] = saveDraft(UID, "d1", form(), new Date("2026-11-13T10:00:00Z"));
    expect(d).toMatchObject({ id: "d1", host: "acme.sg", name: "Acme Advisory", step: "review", updatedAt: "2026-11-13T10:00:00.000Z" });
    expect(d.form).toMatchObject({ address: "https://www.acme.sg/", profession: "Coach", done: ["identity"] });
    expect(loadDrafts(UID)).toEqual([d]);
  });

  it("has no name before a read, and no host before a site is typed", () => {
    const [d] = saveDraft(UID, "d1", form({ dna: null, address: "", networks: ["instagram"], step: "networks" }));
    expect(d).toMatchObject({ host: "", name: "", step: "networks" });
  });

  it("updates a draft in place and moves it to the top, without rewriting an unchanged one", () => {
    saveDraft(UID, "d1", form(), new Date("2026-11-13T10:00:00Z"));
    saveDraft(UID, "d2", form({ address: "beta.sg", dna: null }), new Date("2026-11-13T10:01:00Z"));
    const next = saveDraft(UID, "d1", form({ step: "networks" }), new Date("2026-11-13T10:02:00Z"));
    expect(next.map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(next[0]).toMatchObject({ step: "networks", updatedAt: "2026-11-13T10:02:00.000Z" });
    const same = saveDraft(UID, "d1", form({ step: "networks" }), new Date("2026-11-13T11:00:00Z"));
    expect(same[0].updatedAt).toBe("2026-11-13T10:02:00.000Z");
  });

  it("keeps the three newest, dropping the oldest", () => {
    for (let i = 1; i <= 4; i++) saveDraft(UID, `d${i}`, form({ address: `site${i}.sg` }), new Date(`2026-11-13T10:0${i}:00Z`));
    expect(MAX_DRAFTS).toBe(3);
    expect(loadDrafts(UID).map((d) => d.id)).toEqual(["d4", "d3", "d2"]);
  });

  it("never stores the logo", () => {
    const [d] = saveDraft(UID, "d1", form());
    expect((d.form.dna as { logo: unknown }).logo).toBeNull();
    expect(store.get(`${DRAFTS_PREFIX}${UID}`)).not.toContain("data:image");
  });

  it("removes one draft, leaving the rest", () => {
    saveDraft(UID, "d1", form());
    saveDraft(UID, "d2", form({ address: "beta.sg" }));
    removeDraft(UID, "d1");
    expect(loadDrafts(UID).map((d) => d.id)).toEqual(["d2"]);
  });

  it("ignores text that isn't a form, and stored rows that aren't drafts", () => {
    expect(saveDraft(UID, "d1", "{oops")).toEqual([]);
    store.set(`${DRAFTS_PREFIX}${UID}`, JSON.stringify([{ id: "x" }, null, 3]));
    expect(loadDrafts(UID)).toEqual([]);
    store.set(`${DRAFTS_PREFIX}${UID}`, "not json");
    expect(loadDrafts(UID)).toEqual([]);
  });

  it("still keeps the tab's copy when storage is full", () => {
    vi.stubGlobal("localStorage", { ...mapStorage(store), setItem: () => { throw new Error("QuotaExceededError"); } });
    const session = new Map<string, string>();
    expect(keepForm(UID, null, form(), mapStorage(session))).toMatch(/^d/);
    expect(session.size).toBe(1);
  });

  it("caps a merged list from two devices at the three newest", () => {
    const d = (id: string, at: string) => ({ id, updatedAt: at });
    const merged = listMerger<{ id: string; updatedAt: string }>({ after: capDrafts }).merge(
      JSON.stringify([d("a", "2026-11-13T10:04:00Z"), d("b", "2026-11-13T10:01:00Z")]),
      JSON.stringify([d("c", "2026-11-13T10:03:00Z"), d("e", "2026-11-13T10:02:00Z")]),
      null,
      true,
    );
    expect(JSON.parse(merged!).map((x: { id: string }) => x.id)).toEqual(["a", "c", "e"]);
  });
});

describe("keepForm: what /brands/new's persist does", () => {
  it("starts a draft once something is typed, marks the tab's copy with it, and keeps the logo there only", () => {
    const session = new Map<string, string>();
    const id = keepForm(UID, null, form(), mapStorage(session))!;
    expect(loadDrafts(UID).map((d) => d.id)).toEqual([id]);
    const tab = JSON.parse(session.get("cs-addbrand-form-u1")!);
    expect(tab).toMatchObject({ draft: id, dna: { logo: LOGO } });
    expect(keepForm(UID, id, form({ step: "networks" }), mapStorage(session))).toBe(id);
    expect(loadDrafts(UID)).toHaveLength(1);
  });

  it("removes the draft and the tab's copy when the brand is made (persist(null))", () => {
    const session = new Map<string, string>();
    saveDraft(UID, "d0", form({ address: "other.sg" }));
    const id = keepForm(UID, null, form(), mapStorage(session));
    expect(keepForm(UID, id, null, mapStorage(session))).toBeNull();
    expect(loadDrafts(UID).map((d) => d.id)).toEqual(["d0"]);
    expect(session.size).toBe(0);
  });
});

describe("keptFor: what /brands/new opens on", () => {
  const draft = (id: string, over: Record<string, unknown> = {}): BrandDraft => saveDraft(UID, id, form(over)).find((d) => d.id === id)!;
  const tab = (id: string | null) => JSON.stringify({ ...JSON.parse(form()), ...(id ? { draft: id } : {}) });

  it("resumes the draft the address names, from the tab's own copy when it is that draft's (it still has the logo)", () => {
    const d = draft("d1");
    expect(keptFor(tab("d1"), [d], "d1")).toEqual({ kept: tab("d1"), draft: "d1" });
    const fromDraft = keptFor(tab("d2"), [d], "d1");
    expect(fromDraft.draft).toBe("d1");
    expect(JSON.parse(fromDraft.kept!)).toEqual(d.form);
    expect(keptFor(null, [d], "d1").kept).toBe(JSON.stringify(d.form));
  });

  it("puts a draft back into the form, with the read but no logo", () => {
    const d = draft("d1");
    const back = keptBrand(keptFor(null, [d], "d1").kept, ["identity", "colour"]);
    expect(back).toMatchObject({ address: "https://www.acme.sg/", profession: "Coach", done: ["identity"], dna: { name: "Acme Advisory", logo: null } });
  });

  it("starts a new form for New brand, or a draft that is gone, and keeps a tab's copy from before drafts", () => {
    const d = draft("d1");
    expect(keptFor(tab("d1"), [d], null)).toEqual({ kept: null, draft: null });
    expect(keptFor(tab(null), [d], "gone")).toEqual({ kept: null, draft: null });
    expect(keptFor(tab(null), [d], null)).toEqual({ kept: tab(null), draft: null });
    expect(keptFor(null, [], null)).toEqual({ kept: null, draft: null });
  });
});

describe("a draft's card", () => {
  it("links to its own step, the default left out", () => {
    expect(draftLink({ id: "d1", step: "review" })).toBe("/brands/new?draft=d1&step=review");
    expect(draftLink({ id: "d1", step: "site" })).toBe("/brands/new?draft=d1");
  });

  it("takes the first picked colour, else the read's", () => {
    expect(draftColour({ form: { colours: ["#112233"], dna: { colour: "#445566" } } })).toBe("#112233");
    expect(draftColour({ form: { colours: [], dna: { colour: "#445566" } } })).toBe("#445566");
    expect(draftColour({ form: { dna: null } })).toBeNull();
  });
});
