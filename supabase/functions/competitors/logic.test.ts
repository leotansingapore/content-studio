import { describe, expect, it } from "vitest";
import fixture from "./fixtures/facebook-ads.json";
import {
  type Brand, adLibraryUrl, adsInput, cleanAds, cleanSuggest, excluded, firstHttpsLogo, organicResults, pageMissing, pageOf, parseInput, parseProposals, parseWhys,
  pickSite, postsFailure, sgDay, shapeAds, siteAsk, siteRetry, suggestFilter,
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

describe("ads: where the actor starts", () => {
  it("reads a page id's Ad Library view in Singapore or anywhere, and a bare handle's page", () => {
    expect(adLibraryUrl({ fbPageId: "104504174628", facebook: "SinglifeSG", country: "SG" })).toBe(
      "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=SG&view_all_page_id=104504174628&search_type=page&media_type=all",
    );
    expect(adLibraryUrl({ fbPageId: "104504174628", facebook: null, country: "ALL" })).toContain("&country=ALL&view_all_page_id=104504174628&");
    expect(adLibraryUrl({ fbPageId: null, facebook: "sleekflow.io", country: "SG" })).toBe("https://www.facebook.com/sleekflow.io");
  });

  it("sends the contract's input with no charged add-ons", () => {
    expect(adsInput("https://www.facebook.com/x")).toEqual({
      startUrls: [{ url: "https://www.facebook.com/x" }], resultsLimit: 30, activeStatus: "", sorting: "relevancy_monthly_grouped",
      isDetailsPerAd: false, includeAboutPage: false, enrichWithEcommerceData: false,
    });
  });

  it("refuses a body with no page, and anything that could reshape the URL", () => {
    expect(cleanAds({ competitorId: "c-1", name: "Singlife" })).toBe("Add their Facebook page first.");
    expect(cleanAds({ name: "Singlife", fbPageId: "123456" })).toBe("Say which competitor.");
    expect(cleanAds({ competitorId: "c-1", fbPageId: "12&x=1", facebook: "../ads" })).toBe("Add their Facebook page first.");
    expect(cleanAds({ competitorId: "c-1", name: " Singlife ", fbPageId: "123456", country: "XX" })).toEqual({ competitorId: "c-1", name: "Singlife", fbPageId: "123456", facebook: null, country: "SG" });
    expect(cleanAds({ competitorId: "c-1", facebook: "SinglifeSG", country: "ALL" })).toMatchObject({ fbPageId: null, facebook: "SinglifeSG", country: "ALL" });
  });
});

describe("ads: shaping the actor's answer (the saved run)", () => {
  const items = fixture as Record<string, unknown>[];
  const NOW = Date.parse("2026-10-20T12:00:00Z");

  it("keeps every ad of the run with its fields, running first", () => {
    const ads = shapeAds(items, NOW);
    expect(ads).toHaveLength(10);
    expect(ads.filter((a) => !a.active).map((a) => a.id)).toEqual(["964733842858227"]);
    expect(ads.at(-1)!.id).toBe("964733842858227");
    const muncly = ads.find((a) => a.id === "977824304753041")!;
    expect(muncly).toMatchObject({
      format: "image", headline: "Get a free audit", cta: "See details", link: "https://muncly.com/crm-audit-offer/",
      start: "2026-10-20", end: "2026-10-20", active: true, platforms: ["facebook", "instagram", "threads"], versions: 1, video: null,
    });
    expect(muncly.image).toMatch(/^https:\/\/scontent/);
    expect(muncly.body.startsWith("A new CRM won")).toBe(true);
    expect(muncly.body.length).toBeLessThanOrEqual(600);
  });

  it("reads the format from the media: a video's poster, a DCO's first card, lowercase platforms", () => {
    const ads = shapeAds(items, NOW);
    const video = ads.find((a) => a.id === "1496068682350336")!;
    expect(video.format).toBe("video");
    expect(video.video).toMatch(/^https:\/\/video/);
    expect(video.image).toMatch(/^https:\/\//);
    const dco = ads.find((a) => a.id === "2098596340759533")!;
    expect(dco).toMatchObject({ format: "image", headline: "Card spend beside closed deals.", versions: 1 });
    expect(dco.image).toMatch(/^https:\/\//);
    expect(ads.find((a) => a.id === "1135500952358956")!.platforms).toEqual(["facebook", "instagram", "audience_network", "threads"]);
  });

  it("turns a numeric startDate into the day in Singapore", () => {
    expect(sgDay(1792479600)).toBe("2026-10-20"); // 07:00 UTC
    expect(sgDay(1792432800)).toBe("2026-10-20"); // 18:00 UTC on the 19th is 02:00 on the 20th in Singapore
    expect(sgDay(1792432800000)).toBe("2026-10-20");
    expect(sgDay("2026-10-19T18:00:00.000Z")).toBe("2026-10-20");
    expect(sgDay(null)).toBeNull();
    expect(sgDay("soon")).toBeNull();
  });

  it("keeps one ad per collationId and drops catalog templates", () => {
    const twin = { ...items[0], adArchiveID: "977824304753999" };
    const template = { ...items[2], adArchiveID: "111222333444", collationId: "999", snapshot: { ...(items[2].snapshot as object), body: { text: "Hi {{product.name}}, only {{product.price}}" } } };
    const ads = shapeAds([...items, twin, template], NOW);
    expect(ads).toHaveLength(10);
    expect(ads.filter((a) => a.id.startsWith("9778243047")).length).toBe(1);
    expect(ads.some((a) => a.id === "111222333444")).toBe(false);
  });

  it("gives nulls, never a throw, for missing snapshot fields, and sorts the longest running first", () => {
    const ads = shapeAds([
      { adArchiveID: "500", isActive: true, startDate: 1790000000 },
      { adArchiveID: "501", isActive: true, startDate: 1780000000, snapshot: { body: "plain string body", ctaType: "LEARN_MORE", images: [{ originalImageUrl: "http://insecure.jpg" }] } },
      { adArchiveID: "x" },
      null,
      { adArchiveID: "502", isActive: false, startDate: 1700000000, endDate: 1700864000 },
    ], NOW);
    expect(ads.map((a) => a.id)).toEqual(["501", "500", "502"]);
    expect(ads[1]).toEqual({
      id: "500", format: "text", headline: null, body: "", cta: null, link: null, image: null, video: null,
      start: sgDay(1790000000), end: null, active: true, platforms: [], versions: 1,
    });
    expect(ads[0]).toMatchObject({ body: "plain string body", cta: "Learn more", image: null });
    expect(shapeAds("nope" as unknown as unknown[])).toEqual([]);
  });

  it("caps the list at 30", () => {
    const many = Array.from({ length: 40 }, (_, k) => ({ adArchiveID: String(1000 + k), isActive: true, startDate: 1790000000 + k }));
    expect(shapeAds(many, NOW)).toHaveLength(30);
  });

  it("finds the page the ads came from, and tells a missing page from no ads", () => {
    expect(pageOf(items)).toEqual({ pageId: "362293550309745", pageName: "Muncly" });
    expect(pageOf([])).toEqual({ pageId: null, pageName: null });
    expect(pageMissing([{ url: "https://www.facebook.com/nope", error: "Page not found" }])).toBe(true);
    expect(pageMissing([])).toBe(false);
    expect(pageMissing(items)).toBe(false);
  });
});

describe("posts: what a failed read answers", () => {
  it("keeps the use for a private or missing account and rewrites the private line", () => {
    const p = postsFailure("@acme is private, so its posts can't be read. Make the account public, then refresh.", "acme");
    expect(p).toEqual({ status: 422, code: "private", error: "@acme is private, so we can't read its posts.", refund: false });
    expect(p.error).not.toContain("Make the account public");
    expect(postsFailure("We couldn't find a public Instagram account called @acme. Check the spelling.", "acme")).toMatchObject({ status: 422, code: "not_found", refund: false });
    expect(postsFailure("We couldn't find public TikTok videos for @acme. Check the spelling and that the account is public.", "acme").code).toBe("not_found");
  });

  it("gives both uses back when Apify never answered", () => {
    for (const m of ["The platform took too long to answer. Try again in a few minutes.", "Account audits are paused while the scraping account is sorted out. Try again later.", "Couldn't read the account right now. Try again in a few minutes."]) {
      expect(postsFailure(m, "acme")).toEqual({ status: 502, code: "failed", error: "Couldn't read that account right now. Try again in a few minutes.", refund: true });
    }
  });
});
