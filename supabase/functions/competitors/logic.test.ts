import { describe, expect, it } from "vitest";
import {
  type Brand, cleanSuggest, excluded, firstHttpsLogo, organicResults, parseInput, parseProposals, parseWhys, pickSite, siteAsk, siteRetry, suggestFilter,
} from "./logic";

describe("what the add bar reads", () => {
  it("turns each kind of social link into a handle, with no server call", () => {
    expect(parseInput("https://www.instagram.com/singlife/")).toEqual({ kind: "link", name: "singlife", named: true, fbPageId: null, handles: { instagram: "singlife" } });
    expect(parseInput("https://www.facebook.com/SinglifeSG")).toMatchObject({ kind: "link", handles: { facebook: "SinglifeSG" } });
    expect(parseInput("https://m.facebook.com/sleekflow.io")).toMatchObject({ kind: "link", handles: { facebook: "sleekflow.io" } });
    expect(parseInput("https://www.tiktok.com/@useapollo.io")).toMatchObject({ kind: "link", name: "useapollo.io", handles: { tiktok: "useapollo.io" } });
    expect(parseInput("https://www.linkedin.com/company/singlife/")).toMatchObject({ kind: "link", name: "singlife", handles: { linkedin: "company/singlife" } });
    expect(parseInput("https://www.youtube.com/@joshconsultancy")).toMatchObject({ kind: "link", name: "joshconsultancy", handles: { youtube: "joshconsultancy" } });
    expect(parseInput("instagram.com/sunsamahq")).toMatchObject({ kind: "link", handles: { instagram: "sunsamahq" } });
    expect(parseInput("@joshconsultancy")).toEqual({ kind: "link", name: "joshconsultancy", named: true, fbPageId: null, handles: { instagram: "joshconsultancy" } });
  });

  it("takes the page id from an Ad Library link, and its search words as the name when there are some", () => {
    const lib = "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=SG&view_all_page_id=104504174628&search_type=page";
    expect(parseInput(lib)).toEqual({ kind: "link", name: "Facebook page 104504174628", named: false, fbPageId: "104504174628", handles: {} });
    expect(parseInput(`${lib}&q=Singlife`)).toMatchObject({ name: "Singlife", named: true, fbPageId: "104504174628" });
    expect(parseInput("https://www.facebook.com/ads/library/?q=singlife")).toBeNull();
  });

  it("reads a site as its host, and anything else as a name", () => {
    expect(parseInput("https://www.singlife.com/en/")).toEqual({ kind: "site", site: "singlife.com" });
    expect(parseInput("singlife.com")).toEqual({ kind: "site", site: "singlife.com" });
    expect(parseInput("  WWW.Respond.io ")).toEqual({ kind: "site", site: "respond.io" });
    expect(parseInput("Singlife")).toEqual({ kind: "name", name: "Singlife" });
    expect(parseInput("Prudential Singapore")).toEqual({ kind: "name", name: "Prudential Singapore" });
  });

  it("refuses empty text, other schemes, addresses inside a network and posts on social sites", () => {
    for (const bad of ["", "   ", "x", "javascript:", "javascript:alert(1)", "data:text/html,hi", "http://10.0.0.2", "localhost.local", "https://www.instagram.com/p/Cxyz/", "https://www.facebook.com/sharer/sharer.php?u=x", "https://youtu.be/abc", 5, null]) {
      expect(parseInput(bad), String(bad)).toBeNull();
    }
  });
});

describe("picking a name's website", () => {
  const serp = {
    tasks: [{
      status_code: 20000,
      result: [{
        items: [
          { type: "organic", title: "Singlife | Insurance", url: "https://singlife.com/en", description: "Insurance in Singapore" },
          { type: "people_also_ask", title: "skip me" },
          { type: "organic", title: "Singlife (@singlife)", url: "https://www.instagram.com/singlife/", description: "" },
          { type: "organic", title: "inside", url: "http://192.168.0.1/", description: "" },
          { type: "organic", title: "News", url: "https://www.straitstimes.com/singlife", description: "News" },
        ],
      }],
    }],
  };
  const results = organicResults(serp);

  it("keeps the organic results we could open, keyed in order", () => {
    expect(results.map((r) => [r.key, r.url])).toEqual([["r1", "https://singlife.com/en"], ["r2", "https://www.instagram.com/singlife/"], ["r3", "https://www.straitstimes.com/singlife"]]);
    expect(organicResults({ tasks: [{ status_code: 40102 }] })).toEqual([]);
    expect(organicResults(null)).toEqual([]);
  });

  it("asks Jev one choice with every result and none", () => {
    const a = siteAsk("Singlife", results);
    expect(Object.keys((a.questions.site as { criteria: Record<string, string> }).criteria)).toEqual(["r1", "r2", "r3", "none"]);
    expect(a.state).toMatchObject({ name: "Singlife", country: "Singapore" });
  });

  it("accepts at 0.6, asks Which one from 0.4, and says not found below that or without Jev", () => {
    const at = (choice: string, probabilities: Record<string, number>) => pickSite({ site: { type: "choice", choice, probabilities } }, results);
    expect(at("r1", { r1: 0.6, r2: 0.3, none: 0.1 })).toEqual({ pick: results[0] });
    expect(at("r1", { r1: 0.59, r3: 0.3, r2: 0.05 })).toEqual({ choices: [results[0], results[2], results[1]] });
    expect(at("r2", { r2: 0.4, r1: 0.2 })).toMatchObject({ choices: [results[1], results[0], results[2]] });
    expect(at("r2", { r2: 0.39, none: 0.5 })).toEqual({ notFound: true });
    expect(at("none", { none: 0.9, r1: 0.05 })).toEqual({ notFound: true });
    expect(pickSite(null, results)).toEqual({ notFound: true });
    expect(pickSite({ site: { type: "choice", choice: "r1", probabilities: { r1: 0.9 } } }, [])).toEqual({ notFound: true });
  });

  it("keeps an https logo link only, never a picture", () => {
    expect(firstHttpsLogo(["http://a.sg/l.png", "https://a.sg/t.png"])).toBe("https://a.sg/t.png");
    expect(firstHttpsLogo(["http://a.sg/l.png"])).toBeNull();
  });

  it("tries a site again only when it never answered", () => {
    const named = (name: string) => Object.assign(new Error("x"), { name });
    expect(siteRetry(named("TimeoutError"))).toBe(true);
    expect(siteRetry(new TypeError("error sending request"))).toBe(true);
    expect(siteRetry(new Error("answered 503"))).toBe(true);
    expect(siteRetry(new Error("answered 404"))).toBe(false);
    expect(siteRetry(new Error("inside.sg doesn't resolve to a public address"))).toBe(false);
  });
});

describe("suggesting competitors", () => {
  const brand: Brand = { name: "ActivityTracker", site: "activity-tracker.io", sells: "A daily activity tracker for sales reps", serves: "Self-employed salespeople", topics: [] };
  const cands = Array.from({ length: 9 }, (_, k) => ({ key: `c${k}`, name: `Rival ${k}`, about: "" }));

  it("keeps 0.6 and up, best first, 6 at most, minus the list, the dismissed and the brand itself", () => {
    const scores = [0.9, 0.59, 0.7, 0.95, 0.6, 0.8, 0.65, 0.61, 0.99];
    const kept = suggestFilter(cands, scores, ["rival 8"], brand)!;
    expect(kept.map((c) => c.name)).toEqual(["Rival 3", "Rival 0", "Rival 5", "Rival 2", "Rival 6", "Rival 7"]);
    expect(kept[0].score).toBe(0.95);
    expect(suggestFilter(cands.slice(0, 2), [0.6, 0.59], [], brand)!.map((c) => c.name)).toEqual(["Rival 0"]);
    const self = suggestFilter([{ key: "s", name: "activitytracker", about: "" }, { key: "t", name: "Twin", about: "", site: "activity-tracker.io" }], [0.9, 0.9], [], brand);
    expect(self).toEqual([]);
  });

  it("gives null when Jev answered nothing, so the use goes back", () => {
    expect(suggestFilter(cands, cands.map(() => null), [], brand)).toBeNull();
    expect(suggestFilter([], [], [], brand)).toBeNull();
    expect(suggestFilter(cands.slice(0, 2), [null, 0.3], [], brand)).toEqual([]);
  });

  it("matches the exclude list by name or site", () => {
    expect(excluded({ name: "Pipedrive CRM", site: "pipedrive.com" }, ["pipedrive.com"], brand)).toBe(true);
    expect(excluded({ name: "SleekFlow" }, ["sleekflow"], brand)).toBe(true);
    expect(excluded({ name: "Spotio" }, ["sleekflow"], brand)).toBe(false);
  });

  it("checks the body before anything is counted", () => {
    expect(cleanSuggest({ brand: { name: "X" } })).toBe("Say what you sell or who you serve first.");
    expect(cleanSuggest({ brand, candidates: Array.from({ length: 81 }, (_, k) => ({ key: `k${k}`, name: "n" })) })).toBe("Send at most 80 candidates.");
    const ok = cleanSuggest({ brand, candidates: [{ key: "a", name: " Spotio ", about: "Field sales" }, { key: "", name: "no key" }, { name: "x" }], exclude: ["SleekFlow"] });
    expect(ok).toEqual({ brand, candidates: [{ key: "a", name: "Spotio", about: "Field sales" }], exclude: ["sleekflow"] });
  });

  it("drops proposals without a site we could open, and repeats", () => {
    const content = JSON.stringify({ competitors: [{ name: "Spotio", site: "https://spotio.com/" }, { name: "Again", site: "www.spotio.com" }, { name: "Local", site: "localhost" }, { name: "", site: "x.sg" }] });
    expect(parseProposals(content)).toEqual([{ name: "Spotio", site: "spotio.com" }]);
    expect(parseProposals("not json")).toEqual([]);
  });

  it("keeps why lines for the keys asked, cut to 160 characters with no em dashes", () => {
    const content = JSON.stringify({ whys: [{ key: "c1", why: `Reps weigh both — ${"x".repeat(200)}` }, { key: "zz", why: "not asked" }] });
    const whys = parseWhys(content, ["c1"]);
    expect(Object.keys(whys)).toEqual(["c1"]);
    expect(whys.c1).toHaveLength(160);
    expect(whys.c1).not.toMatch(/—/);
    expect(parseWhys("nope", ["c1"])).toEqual({});
  });
});
