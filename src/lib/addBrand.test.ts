import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blankDna, createBrand, keptBrand, keptBrandKey, NETWORKS, newBrandKit, parseTopics, PROFESSION_NEEDED, profileAddress, readBody, shownTopics, type BrandDna } from "./addBrand";
import { loadBrand } from "./carousel";
import { loadPositioning } from "./positioning";
import { loadFacts } from "./voiceMemory";
import { activeProfileId, loadProfiles } from "./profiles";

const CARDS = ["identity", "colour", "social", "offer", "topics", "voice"] as const;
const dna: BrandDna = {
  url: "https://acme.sg",
  name: "Acme Advisory",
  colour: "#0f766e",
  logo: null,
  handles: { instagram: "acme.sg" },
  oneLiner: "We help young families plan their CPF.",
  audience: "parent",
  audienceDetail: "Parents with kids under 10",
  topics: ["CPF", "HDB"],
  edge: "Plain answers",
  voice: "Warm and plain.",
};

describe("keptBrand", () => {
  it("puts back a site read and the cards already checked", () => {
    const raw = JSON.stringify({ address: "acme.sg", name: "", justName: false, dna, done: ["identity", "colour"] });
    expect(keptBrand(raw, CARDS)).toEqual({ address: "acme.sg", name: "", justName: false, profession: "", dna, done: ["identity", "colour"] });
  });

  it("puts back what the person said they do, even when nothing else was typed", () => {
    expect(keptBrand(JSON.stringify({ profession: "Coach" }), CARDS)).toMatchObject({ profession: "Coach", dna: null });
    expect(keptBrand(JSON.stringify({ address: "acme.sg", profession: 7 }), CARDS)).toMatchObject({ profession: "" });
  });

  it("keeps a typed address or name before any read", () => {
    expect(keptBrand(JSON.stringify({ address: "acme.sg" }), CARDS)).toMatchObject({ address: "acme.sg", dna: null, done: [] });
    expect(keptBrand(JSON.stringify({ name: "MoneyBees", justName: true }), CARDS)).toMatchObject({ name: "MoneyBees", justName: true });
  });

  it("drops a read that is not the right shape, and cards it does not know", () => {
    const bad = { ...dna, topics: "CPF" };
    expect(keptBrand(JSON.stringify({ address: "acme.sg", dna: bad, done: ["identity"] }), CARDS)).toMatchObject({ address: "acme.sg", dna: null });
    expect(keptBrand(JSON.stringify({ address: "a.sg", dna, done: ["identity", "nope", 3] }), CARDS)?.done).toEqual(["identity"]);
  });

  it("returns null for nothing worth putting back or text that isn't JSON", () => {
    expect(keptBrand(null, CARDS)).toBeNull();
    expect(keptBrand("{oops", CARDS)).toBeNull();
    expect(keptBrand(JSON.stringify({ address: "", name: "" }), CARDS)).toBeNull();
    expect(keptBrand("[]", CARDS)).toBeNull();
  });

  it("is kept per sign-in, outside the synced prefix", () => {
    expect(keptBrandKey("u1")).toBe("cs-addbrand-form-u1");
    expect(keptBrandKey("u1").startsWith("content-studio-")).toBe(false);
  });
});

describe("blankDna: a link that couldn't be read, filled in by hand", () => {
  it("starts empty cards named from the site's address, which the form keeps across a reload", () => {
    const d = blankDna(" https://www.acme-qa.sg/about ");
    expect(d).toMatchObject({ url: "https://www.acme-qa.sg/about", name: "Acme qa", colour: null, logo: null, handles: {}, oneLiner: "", topics: [], voice: "" });
    expect(keptBrand(JSON.stringify({ dna: d }), CARDS)?.dna).toStrictEqual(d);
    expect(blankDna("acme.sg").name).toBe("Acme");
    // a long address still fits the name card: 40 characters at most
    expect(blankDna("the-very-long-name-of-a-financial-advisory-practice.sg").name).toBe("The very long name of a financial adviso");
  });
  it("leaves the name empty for an App Store link or something that isn't an address", () => {
    expect(blankDna("apps.apple.com/sg/app/structured/id1499198946").name).toBe("");
    expect(blankDna("").name).toBe("");
  });
});

// Pinned on today's /brands/new (before brand-from-website): everyone else's request and new kit stay exactly these.
describe("what /brands/new sends and saves", () => {
  it("sends the address only", () => {
    expect(readBody("acme.sg")).toStrictEqual({ url: "acme.sg" });
  });

  it("saves the name, handle, colour, logo and handles in the new kit, nothing more", () => {
    expect(newBrandKit({ ...dna, logo: "data:image/png;base64,AAAA", handles: { instagram: "@acme.sg", facebook: "acmesg" } }, "Acme")).toStrictEqual({
      color: "#0f766e",
      name: "Acme",
      handle: "@acme.sg",
      logo: "data:image/png;base64,AAAA",
      instagram: "acme.sg",
      facebook: "acmesg",
    });
    expect(newBrandKit({ ...dna, colour: null, handles: {} }, "Acme")).toStrictEqual({ color: "#1E3A8A", name: "Acme", handle: "" });
  });

  it("takes a pasted profile link as the account, not glued after the network's address", () => {
    expect(newBrandKit({ ...dna, handles: { instagram: "https://www.instagram.com/acme_qa/?hl=en" } }, "Acme")).toMatchObject({ handle: "@acme_qa", instagram: "acme_qa" });
    const at = (n: number, typed: string) => profileAddress(NETWORKS[n].base, typed);
    expect([at(0, "@acme"), at(0, "https://www.instagram.com/acme_qa/"), at(0, "instagram.com/acme")]).toEqual([
      "https://www.instagram.com/acme", "https://www.instagram.com/acme_qa/", "https://www.instagram.com/acme",
    ]);
    expect([at(1, "m.facebook.com/acmeqa"), at(2, "linkedin.com/company/acme-qa"), at(3, "@acme.qa"), at(3, "https://www.tiktok.com/@acme.qa")]).toEqual([
      "https://www.facebook.com/acmeqa", "https://www.linkedin.com/company/acme-qa", "https://www.tiktok.com/@acme.qa", "https://www.tiktok.com/@acme.qa",
    ]);
  });
});

describe("Leo's /brands/new (brand-from-website)", () => {
  it("asks for the deep read", () => {
    expect(readBody("acme.sg", true)).toStrictEqual({ url: "acme.sg", deep: true });
    expect(readBody("acme.sg", false)).toStrictEqual({ url: "acme.sg" });
  });

  it("keeps the site and when it was read in the new kit", () => {
    expect(newBrandKit({ ...dna, readAt: "2026-10-21T08:00:00.000Z" }, "Acme")).toStrictEqual({
      color: "#0f766e",
      name: "Acme",
      handle: "@acme.sg",
      instagram: "acme.sg",
      website: "https://acme.sg",
      websiteReadAt: "2026-10-21T08:00:00.000Z",
    });
  });
});

describe("creating a brand (Add a brand)", () => {
  const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
  const mem = () => {
    const m = new Map<string, string>();
    return { get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() };
  };
  beforeEach(() => {
    const s = mem();
    vi.stubGlobal("window", { localStorage: s, location: { pathname: "/brands/new", search: "", hash: "" }, history: { state: null, replaceState: () => undefined }, dispatchEvent: () => true });
    vi.stubGlobal("localStorage", s);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("creates nothing until What do you do? has an answer, and says why", () => {
    for (const profession of ["", "   "]) {
      expect(createBrand(UID, "Ada Homes", null, profession, null)).toEqual({ ok: false, error: PROFESSION_NEEDED });
      expect(createBrand(UID, "Ada Homes", dna, profession, null)).toEqual({ ok: false, error: PROFESSION_NEEDED });
    }
    expect(loadProfiles(UID).map((p) => p.id)).toEqual(["me"]);
    expect(loadBrand(UID)).toBeNull();
  });

  it("saves the answer on the new brand's kit, with or without a site read, and opens the brand", () => {
    const named = createBrand(UID, "Ada Homes", null, "Real estate agent", null);
    if (named.ok === false) throw new Error(named.error);
    expect(activeProfileId(UID)).toBe(named.id);
    expect(loadBrand(UID)).toMatchObject({ name: "Ada Homes", profession: "Real estate agent" });
    const read = createBrand(UID, "Acme Advisory", dna, "Financial adviser", null);
    if (read.ok === false) throw new Error(read.error);
    expect(activeProfileId(UID)).toBe(read.id);
    expect(loadBrand(UID)).toMatchObject({ name: "Acme Advisory", profession: "Financial adviser", color: "#0F766E" });
    expect(loadPositioning(UID)?.oneLiner).toBe("We help young families plan their CPF.");
  });

  it("puts an App Store read's facts on the new brand only", () => {
    const facts = ["Tidy is free to download on the App Store", 'Users of other productivity apps complain: "Will not sync"'];
    const made = createBrand(UID, "Tidy", { ...dna, name: "Tidy" }, "productivity app", null, facts);
    if (made.ok === false) throw new Error(made.error);
    expect(loadFacts(UID).map((f) => f.text)).toEqual(facts);
    const other = createBrand(UID, "Acme Advisory", dna, "Financial adviser", null);
    if (other.ok === false) throw new Error(other.error);
    expect(loadFacts(UID)).toEqual([]);
  });
});

describe("the Topics field", () => {
  const type = (start: string[], keys: string) => {
    let typed = "";
    let topics = start;
    let shown = shownTopics(typed, topics);
    for (const k of keys) {
      typed = shown + k;
      topics = parseTopics(typed);
      shown = shownTopics(typed, topics);
    }
    return { shown, topics };
  };

  it("keeps every comma and space typed, and saves the topics split", () => {
    expect(type([], "retirement planning, tax")).toEqual({ shown: "retirement planning, tax", topics: ["retirement planning", "tax"] });
    expect(type(["wealth", "estate"], ", estate planning")).toEqual({ shown: "wealth, estate, estate planning", topics: ["wealth", "estate", "estate planning"] });
  });

  it("shows the read's topics until something is typed, and a new read over old typing", () => {
    expect(shownTopics("", ["CPF", "HDB"])).toBe("CPF, HDB");
    expect(shownTopics("tax, ", ["CPF"])).toBe("CPF");
    expect(parseTopics(" a, ,b,c,d,e,f,g ")).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
});
