import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
const make = vi.hoisted(() => vi.fn());
vi.mock("@/lib/remix", async (orig) => ({ ...(await orig<typeof import("@/lib/remix")>()), requestMake: make }));
import { EdgeError } from "@/lib/edgeFn";
import { formatJobs } from "@/lib/formatJob";
import { HOOK_FORMULAS } from "@/lib/hookFormulas";
import { blankImage, loadImages, saveImage } from "@/lib/images";
import type { MakeResponse } from "@/lib/remix";
import { parseMakeRequest } from "../../../supabase/functions/remix/logic";
import { AD_FORMULAS, VERSIONS, adVersionsRun, hookName, nextFormulas, startAdVersions, type AdVersionsAsk } from "./AdVersions";

class MemStorage {
  s = new Map<string, string>();
  get length() { return this.s.size; }
  key(i: number) { return [...this.s.keys()][i] ?? null; }
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}
const U = "u1";
const ID = "img-adv1xx";

beforeEach(() => {
  const storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, sessionStorage: new MemStorage(), addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("dispatchEvent", () => true);
  make.mockReset();
  saveImage(U, { ...blankImage(), id: ID, words: { topic: "Saving on a fresh grad pay" } });
});
afterEach(() => vi.unstubAllGlobals());

const version = (formula: string, i: number) => ({ formula, words: { headline: `Headline ${i}`, line: `Line ${i}.`, button: "Message me" }, caption: `Caption ${i}. Ask me.` });
const reply = (formulas: string[], o: { best?: number | null; dropped?: number[]; checked?: boolean } = {}): MakeResponse => ({
  as: "ads",
  result: { as: "ads", layout: "headline", versions: formulas.map(version), best: o.best ?? null, dropped: o.dropped ?? [], checked: o.checked ?? true },
  flags: { copied: [], claim: false, invented: false },
  usage: { used: 1, limit: 30 },
});
const ask = (o: Partial<AdVersionsAsk> = {}): AdVersionsAsk => ({ designId: ID, layout: "headline", source: null, topic: "Saving on a fresh grad pay", note: "", size: "4x5", shows: "", ...o });

describe("the hooks versions open on", () => {
  it("are all real hook formulas, six different ones a press, the next press starting after the last one written", () => {
    for (const id of AD_FORMULAS) expect(HOOK_FORMULAS.some((f) => f.id === id), id).toBe(true);
    expect(new Set(AD_FORMULAS).size).toBe(AD_FORMULAS.length);
    const first = nextFormulas();
    expect(first).toEqual(AD_FORMULAS.slice(0, VERSIONS));
    const second = nextFormulas(first);
    expect(new Set(second).size).toBe(VERSIONS);
    expect(second[0]).toBe(AD_FORMULAS[VERSIONS]);
    // round the list
    expect(second.slice(-2)).toEqual(AD_FORMULAS.slice(0, 2));
    expect(nextFormulas(["not-one"])).toEqual(first);
    expect(hookName("myth-bust")).toBe("Myth bust");
  });
});

describe("Write 6 versions", () => {
  it("is one make the server takes as sent, and keeps Jev's kept versions in the design with Best in the fields", async () => {
    make.mockResolvedValue(reply(nextFormulas(), { best: 3, dropped: [1] }));
    await startAdVersions(U, ask());
    expect(make).toHaveBeenCalledTimes(1);
    const body = make.mock.calls[0][0];
    expect(body).toMatchObject({ mode: "make", as: "ads", layout: "headline", versions: AD_FORMULAS.slice(0, 6), topic: "Saving on a fresh grad pay" });
    expect("shows" in body).toBe(false);
    expect(parseMakeRequest(body).ok).toBe(true);
    const saved = loadImages(U)[0];
    expect(saved.versions).toMatchObject({ layout: "headline", best: 2, out: 1, checked: true });
    expect(saved.versions!.list.map((v) => v.formula)).toEqual(["myth-bust", "warning", "permission", "good-great", "callout"]);
    expect(saved.words).toMatchObject({ topic: "Saving on a fresh grad pay", headline: "Headline 3", line: "Line 3.", caption: "Caption 3. Ask me." });
    expect(adVersionsRun()).toMatchObject({ designId: ID, state: "done" });
    expect(formatJobs().find((j) => j.slug === "static-ad")).toMatchObject({ state: "ready", href: `/image?image=${ID}&versions=6` });
  });

  it("writes the next six hooks on a second press, and the first kept one when Jev gave no best", async () => {
    make.mockResolvedValue(reply(nextFormulas()));
    await startAdVersions(U, ask());
    make.mockResolvedValue(reply(nextFormulas(AD_FORMULAS.slice(0, 6)), { checked: false }));
    await startAdVersions(U, ask({ shows: "A big orange number" }));
    expect(make.mock.calls[1][0]).toMatchObject({ versions: nextFormulas(AD_FORMULAS.slice(0, 6)), shows: "A big orange number" });
    expect(loadImages(U)[0]).toMatchObject({ words: { headline: "Headline 0" }, versions: { best: null, checked: false } });
  });

  it("keeps the design as it was when the writer says no, and says why", async () => {
    make.mockRejectedValue(new EdgeError("None of these were safe to run. Try another topic.", 422, "refused"));
    await startAdVersions(U, ask());
    expect(adVersionsRun()).toMatchObject({ state: "failed", refused: true, error: "None of these were safe to run. Try another topic." });
    expect(loadImages(U)[0]).toMatchObject({ words: { topic: "Saving on a fresh grad pay" } });
    expect(loadImages(U)[0].versions).toBeUndefined();
    make.mockResolvedValue({ ...reply(["myth-bust"]), result: { as: "image" } });
    await startAdVersions(U, ask());
    expect(adVersionsRun()).toMatchObject({ state: "failed", error: "Couldn't write the versions right now. Try again in a minute." });
  });
});
