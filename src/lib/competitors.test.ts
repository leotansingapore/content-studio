import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeError } from "@/lib/edgeFn";
import type { MarketDigest } from "../../supabase/functions/market/logic.ts";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));

const c = await import("./competitors");
type Competitor = import("./competitors").Competitor;
type EditFields = import("./competitors").EditFields;
type ReadState = import("./competitors").ReadState;

class MemStorage {
  s = new Map<string, string>();
  full = Infinity;
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (v.length > this.full) throw new DOMException("full", "QuotaExceededError");
    this.s.set(k, v);
  }
  removeItem(k: string) { this.s.delete(k); }
}
let storage: MemStorage;
const changed = vi.fn();

beforeEach(() => {
  storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("dispatchEvent", (e: Event) => changed(e.type));
  callFn.mockReset();
  changed.mockReset();
  c.takeNotices();
});
afterEach(() => vi.unstubAllGlobals());

const row = (name: string, extra: Partial<Omit<Competitor, "id" | "addedAt">> = {}): Omit<Competitor, "id" | "addedAt"> =>
  ({ name, site: null, logo: null, why: "", fbPageId: null, handles: {}, adsCountry: "SG", source: "typed", ...extra });
const added = (r: ReturnType<typeof c.addCompetitor>) => ("c" in r ? r.c : (() => { throw new Error(r.reason); })());

describe("the synced list", () => {
  it("lives under content-studio-competitors- plus the brand's scoped id, and reads bad JSON as empty", () => {
    expect(c.competitorsKey("u1")).toBe("content-studio-competitors-u1");
    c.addCompetitor("u1", row("Singlife", { site: "singlife.com" }));
    expect(JSON.parse(storage.getItem("content-studio-competitors-u1")!).list[0]).toMatchObject({ name: "Singlife", site: "singlife.com" });
    expect(changed).toHaveBeenCalledWith("content-studio-competitors-changed");
    storage.setItem("content-studio-competitors-u1", "{nope");
    expect(c.loadCompetitors("u1")).toEqual({ list: [], dismissed: [] });
    storage.setItem("content-studio-competitors-u1", JSON.stringify({ list: [null, { id: "x" }, { id: "a-1234", name: "A", logo: "data:image/png;base64,AAA", handles: { instagram: "a", x: "y" } }], dismissed: [5, "b"] }));
    expect(c.loadCompetitors("u1")).toMatchObject({ list: [{ id: "a-1234", name: "A", logo: null, handles: { instagram: "a" }, adsCountry: "SG", source: "typed" }], dismissed: ["b"] });
  });

  it("adds with a fresh id and refuses a repeat by site, Facebook page, any handle or name", () => {
    const a = added(c.addCompetitor("u1", row("Singlife", { site: "singlife.com", handles: { instagram: "singlife" } })));
    expect(a.id).toMatch(/^singlife-[a-z0-9]{4}$/);
    added(c.addCompetitor("u1", row("Spotio", { fbPageId: "123456" })));
    for (const dup of [row("Singlife Pte", { site: "singlife.com" }), row("Other", { handles: { instagram: "SINGLIFE" } }), row("Page", { fbPageId: "123456" }), row("singlife")]) {
      expect(c.addCompetitor("u1", dup)).toMatchObject({ ok: false, reason: "duplicate" });
    }
    expect(c.addCompetitor("u1", row("Other", { handles: { tiktok: "singlife" } })).ok).toBe(true);
  });

  it("blocks the 13th", () => {
    for (let k = 0; k < 12; k++) expect(c.addCompetitor("u1", row(`Rival ${k}`)).ok).toBe(true);
    expect(c.addCompetitor("u1", row("Rival 12"))).toEqual({ ok: false, reason: "cap" });
    expect(c.loadCompetitors("u1").list).toHaveLength(c.MAX_COMPETITORS);
  });

  it("removes, stays removed on the next read, and Undo puts the row back in its place", () => {
    const rows = ["A", "B", "C"].map((n, k) => added(c.addCompetitor("u1", row(n), new Date(Date.UTC(2026, 9, 1 + k)))));
    const gone = c.removeCompetitor("u1", rows[1].id)!;
    expect(gone).toEqual(rows[1]);
    expect(c.loadCompetitors("u1").list.map((x) => x.name)).toEqual(["A", "C"]);
    expect(c.restoreCompetitor("u1", gone)).toBe(true);
    expect(c.loadCompetitors("u1").list).toEqual(rows);
    expect(c.removeCompetitor("u1", "nope")).toBeNull();
  });

  it("Undo puts nothing back once the same business was added again or the list is full", () => {
    const a = added(c.addCompetitor("u1", row("Singlife", { site: "singlife.com" })));
    const gone = c.removeCompetitor("u1", a.id)!;
    added(c.addCompetitor("u1", row("Singlife Pte", { site: "singlife.com" })));
    expect(c.restoreCompetitor("u1", gone)).toBe(false);
    expect(c.loadCompetitors("u1").list.map((x) => x.name)).toEqual(["Singlife Pte"]);
    for (let k = 1; k < c.MAX_COMPETITORS; k++) added(c.addCompetitor("u1", row(`Rival ${k}`)));
    const last = c.removeCompetitor("u1", c.loadCompetitors("u1").list[5].id)!;
    added(c.addCompetitor("u1", row("Late add")));
    expect(c.restoreCompetitor("u1", last)).toBe(false);
    expect(c.loadCompetitors("u1").list).toHaveLength(c.MAX_COMPETITORS);
  });

  it("keeps each brand's list apart", async () => {
    const { addProfile, setActiveProfile } = await import("@/lib/profiles");
    c.addCompetitor("u1", row("Singlife"));
    const other = addProfile("u1", "Second brand");
    setActiveProfile("u1", other.id);
    expect(c.competitorsKey("u1")).toBe(`content-studio-competitors-u1~${other.id}`);
    expect(c.loadCompetitors("u1").list).toEqual([]);
    setActiveProfile("u1", "me");
    expect(c.loadCompetitors("u1").list.map((x) => x.name)).toEqual(["Singlife"]);
  });

  it("trims instead of failing when storage is full: dismissed names first, then the logo links", () => {
    const logo = `https://a.sg/${"l".repeat(300)}.png`;
    added(c.addCompetitor("u1", row("Singlife", { logo })));
    for (let k = 0; k < 60; k++) c.dismissName("u1", `name ${k}`);
    const now = c.loadCompetitors("u1");
    const trimmed = { ...now, dismissed: ["one more", ...now.dismissed].slice(0, 20) };
    storage.full = JSON.stringify(trimmed).length;
    c.dismissName("u1", "One More");
    expect(c.loadCompetitors("u1")).toEqual(trimmed);
    const bare = { list: trimmed.list.map((x) => ({ ...x, logo: null })), dismissed: ["two more", ...trimmed.dismissed].slice(0, 20) };
    storage.full = JSON.stringify(bare).length;
    c.dismissName("u1", "Two More");
    expect(c.loadCompetitors("u1")).toEqual(bare);
  });
});

describe("suggestion candidates", () => {
  const digest = (checkedAt: string, named: string[]): MarketDigest => ({ checkedAt, news: [], posts: [], geo: [{ question: "best crm", position: "named", sources: [], checkUrl: null, named }] });

  it("puts Your market's newest named brands first, drops the list and Not them, dedupes and stops at 80", () => {
    storage.setItem("content-studio-market-u1", JSON.stringify({ name: "AT", checks: [digest("2026-10-01T00:00:00Z", ["Old One"]), digest("2026-10-08T00:00:00Z", ["Pipedrive", "SleekFlow", "pipedrive", ...Array.from({ length: 20 }, (_, k) => `Named ${k}`)])] }));
    c.addCompetitor("u1", row("Spotio"));
    c.dismissName("u1", "SleekFlow");
    const cands = c.suggestCandidates("u1");
    expect(cands.slice(0, 2).map((x) => x.name)).toEqual(["Pipedrive", "Named 0"]);
    expect(cands.findIndex((x) => x.name === "Old One")).toBe(21);
    expect(cands[0].about).toBe('Named when ChatGPT was asked "best crm"');
    const names = cands.map((x) => x.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain("sleekflow");
    expect(names).not.toContain("spotio");
    // 22 named + 66 creators + 6 advertisers (SleekFlow is one) = 94, cut to 80 from the end
    expect(cands).toHaveLength(80);
    expect(cands.some((x) => x.key.startsWith("ad:"))).toBe(false);
    expect(cands.find((x) => x.key.startsWith("a:"))?.about).toMatch(/ on /);
  });

  it("describes the brand from the brand kit, F.A.D.S. and Your market", () => {
    storage.setItem("content-studio-carousel-brand-u1", JSON.stringify({ name: "ActivityTracker", color: "#000000", handle: "", offers: [{ name: "Pro plan", url: "https://a.io" }] }));
    storage.setItem("content-studio-positioning-u1", JSON.stringify({ oneLiner: "We help reps hit their numbers.", audience: "general", audienceDetail: "", topics: [] }));
    storage.setItem("content-studio-market-u1", JSON.stringify({ site: "activity-tracker.io", audience: "Self-employed salespeople", topics: ["sales habits"] }));
    expect(c.brandFacts("u1")).toEqual({ name: "ActivityTracker", site: "activity-tracker.io", sells: "Pro plan. We help reps hit their numbers.", serves: "Self-employed salespeople", topics: ["sales habits"] });
  });

  it("joins a one-liner that ends in a full stop to the edge with one full stop", () => {
    storage.setItem("content-studio-positioning-u1", JSON.stringify({ oneLiner: "One app for sales reps.", edge: "Built for WhatsApp", audience: "general", audienceDetail: "", topics: [] }));
    expect(c.brandFacts("u1").sells).toBe("One app for sales reps. Built for WhatsApp");
  });

  it("brings a hand-picked creator's handle along when their suggestion is added", () => {
    expect(c.fromSuggestion({ name: "Josh Tan (TheAstuteParent)", site: null, why: "Parents compare", score: 0.8 })).toMatchObject({ handles: { youtube: "joshconsultancy" }, source: "suggested", why: "Parents compare" });
    expect(c.fromSuggestion({ name: "Spotio", site: "spotio.com", why: "", score: 0.7 })).toMatchObject({ site: "spotio.com", handles: {} });
  });
});

describe("the editor", () => {
  const f = (extra: Partial<EditFields> = {}): EditFields => ({ name: "Singlife", site: "", facebook: "", instagram: "", tiktok: "", linkedin: "", youtube: "", why: "", adsCountry: "SG", ...extra });

  it("reads links or bare handles in each field", () => {
    const r = c.readEdit(f({ site: "https://www.singlife.com/en/", facebook: "https://www.facebook.com/ads/library/?view_all_page_id=104504174628", instagram: "@singlife", tiktok: "https://www.tiktok.com/@singlife", linkedin: "singlife", youtube: "https://www.youtube.com/@singlife", adsCountry: "ALL" }));
    expect(r).toEqual({ ok: true, patch: { name: "Singlife", site: "singlife.com", fbPageId: "104504174628", handles: { instagram: "singlife", tiktok: "singlife", linkedin: "company/singlife", youtube: "singlife" }, why: "", adsCountry: "ALL" } });
    expect(c.readEdit(f({ facebook: "facebook.com/SinglifeSG" }))).toMatchObject({ ok: true, patch: { fbPageId: null, handles: { facebook: "SinglifeSG" } } });
  });

  it("names the first field it can't read", () => {
    expect(c.readEdit(f({ name: " " }))).toEqual({ ok: false, field: "name" });
    expect(c.readEdit(f({ site: "Singlife insurance" }))).toEqual({ ok: false, field: "site" });
    expect(c.readEdit(f({ instagram: "not a handle!" }))).toEqual({ ok: false, field: "instagram" });
  });
});

describe("reading a site or a name outside React", () => {
  it("fills the row in from what the site says", async () => {
    const a = added(c.addCompetitor("u1", row("singlife.com", { site: "singlife.com" })));
    callFn.mockResolvedValueOnce({ found: { name: "Singlife", site: "singlife.com", logo: "https://singlife.com/t.png", handles: { instagram: "singlife" } } });
    const done = c.runRead("u1", a.id, "singlife.com");
    expect(c.readState("u1", a.id)).toEqual({ status: "running", input: "singlife.com" });
    await done;
    expect(callFn).toHaveBeenCalledWith("competitors", { mode: "read", input: "singlife.com" }, c.READ_FAILED);
    expect(c.readState("u1", a.id)).toBeUndefined();
    expect(c.loadCompetitors("u1").list[0]).toMatchObject({ name: "Singlife", logo: "https://singlife.com/t.png", handles: { instagram: "singlife" } });
  });

  it("asks Which one, and a pick of a social result becomes a handle with no second call", async () => {
    const a = added(c.addCompetitor("u1", row("Acme")));
    callFn.mockResolvedValueOnce({ choices: [{ name: "Acme", site: "https://www.instagram.com/acme/", title: "Acme" }, { name: "Acme", site: "https://acme.sg/", title: "Acme Pte" }] });
    await c.runRead("u1", a.id, "Acme");
    const st = c.readState("u1", a.id);
    expect(st?.status).toBe("choices");
    c.pickChoice("u1", a.id, (st as Extract<ReadState, { status: "choices" }>).choices[0]);
    expect(callFn).toHaveBeenCalledTimes(1);
    expect(c.loadCompetitors("u1").list[0].handles).toEqual({ instagram: "acme" });
  });

  it("opens the editor when not found, on None of these, on a 429 and on a 403", async () => {
    const a = added(c.addCompetitor("u1", row("Nobody")));
    callFn.mockResolvedValueOnce({ notFound: true });
    await c.runRead("u1", a.id, "Nobody");
    expect(c.readState("u1", a.id)?.status).toBe("notFound");
    expect(c.takeNotices()).toEqual([{ title: "", edit: a.id }]);
    callFn.mockRejectedValueOnce(new EdgeError("You've used all 20 for today. It resets at 8am Singapore time.", 429, "daily_limit"));
    await c.runRead("u1", a.id, "Nobody");
    callFn.mockRejectedValueOnce(new EdgeError("This isn't switched on for your account yet.", 403, "not_enabled"));
    await c.runRead("u1", a.id, "Nobody");
    expect(c.takeNotices()).toEqual([
      { title: "You've used all 20 for today. It resets at 8am Singapore time.", edit: a.id },
      { title: "Competitors is not switched on for this account.", edit: a.id },
    ]);
    c.noneOfThese("u1", a.id);
    expect(c.takeNotices()).toEqual([{ title: "", edit: a.id }]);
  });

  it("offers Try again when the read failed", async () => {
    const a = added(c.addCompetitor("u1", row("down.sg", { site: "down.sg" })));
    callFn.mockRejectedValueOnce(new EdgeError("Couldn't read their site. Try again in a few minutes.", 502, "failed"));
    await c.runRead("u1", a.id, "down.sg");
    expect(c.readState("u1", a.id)).toEqual({ status: "failed", input: "down.sg", message: c.READ_FAILED });
  });

  it("drops a row that turns out to be one already watched", async () => {
    added(c.addCompetitor("u1", row("Singlife", { site: "singlife.com" })));
    const b = added(c.addCompetitor("u1", row("Singlife Financial")));
    callFn.mockResolvedValueOnce({ found: { name: "Singlife Financial", site: "singlife.com", logo: null, handles: {} } });
    await c.runRead("u1", b.id, "Singlife Financial");
    expect(c.loadCompetitors("u1").list.map((x) => x.name)).toEqual(["Singlife"]);
    expect(c.takeNotices()).toEqual([{ title: "You already watch Singlife." }]);
  });

  it("keeps the last suggestions on the device and sends the list and Not them as exclude", async () => {
    c.addCompetitor("u1", row("Spotio", { site: "spotio.com" }));
    c.dismissName("u1", "SleekFlow");
    callFn.mockResolvedValueOnce({ suggestions: [{ name: "Pipedrive", site: "pipedrive.com", why: "Reps compare both.", score: 0.8 }] });
    await c.runSuggest("u1");
    expect(callFn.mock.calls[0][1]).toMatchObject({ mode: "suggest", exclude: ["spotio", "spotio.com", "sleekflow"] });
    expect(c.loadSuggestions("u1")?.suggestions.map((s) => s.name)).toEqual(["Pipedrive"]);
    expect(c.isSuggesting()).toBe(false);
  });
});
