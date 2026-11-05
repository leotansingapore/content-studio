import { describe, expect, it } from "vitest";
import { FACT_CHARS } from "@/lib/voiceMemory";
import {
  appDna,
  appFacts,
  appProfession,
  appStoreLink,
  isAppRead,
  MAX_COMPLAINTS,
  openingLine,
  painFact,
  proofLines,
  readComplaints,
  readListing,
  readRivals,
  splitTitle,
  toComplaints,
  toListing,
  type AppListing,
} from "@/lib/appStore";

// Synthetic answers in the shape Apple's lookup, search and review feeds return (no real reviews kept here).
const LOOKUP = {
  resultCount: 1,
  results: [
    {
      trackId: 1234567,
      trackName: "Tidy: Daily Planner Todo",
      primaryGenreName: "Productivity",
      sellerName: "Tidy Labs",
      sellerUrl: "https://tidy.example",
      artworkUrl512: "https://is1-ssl.mzstatic.com/icon512.png",
      screenshotUrls: ["https://is1-ssl.mzstatic.com/s1.png", "javascript:alert(1)", "https://is1-ssl.mzstatic.com/s2.png"],
      description: "Plan your day on one timeline. Move a task and the rest follow.\n\nMore lines here.",
      averageUserRating: 4.79369,
      userRatingCount: 168503,
      formattedPrice: "Free",
      trackViewUrl: "https://apps.apple.com/us/app/tidy/id1234567?uo=4",
    },
  ],
};
const listing = toListing(LOOKUP, "us") as AppListing;

const review = (id: string, stars: number, title: string, body: string) => ({
  id: { label: id },
  "im:rating": { label: String(stars) },
  title: { label: title },
  content: { label: body },
});
const feed = (...entry: unknown[]) => ({ feed: { entry } });

describe("appStoreLink", () => {
  it("reads the id and store country from App Store links", () => {
    expect(appStoreLink("https://apps.apple.com/us/app/structured-daily-planner-todo/id1499198946?uo=4")).toEqual({ id: 1499198946, country: "us" });
    expect(appStoreLink("apps.apple.com/sg/app/foo/id123456")).toEqual({ id: 123456, country: "sg" });
    expect(appStoreLink("https://apps.apple.com/app/id123456")).toEqual({ id: 123456, country: "us" });
  });
  it("leaves websites and look-alikes to the site read", () => {
    expect(appStoreLink("acme.sg")).toBeNull();
    expect(appStoreLink("https://evil.example/apps.apple.com/us/app/x/id123456")).toBeNull();
    expect(appStoreLink("https://apps.apple.com.evil.example/us/app/x/id123456")).toBeNull();
    expect(appStoreLink("https://apps.apple.com/us/app/no-id")).toBeNull();
  });
});

describe("the listing", () => {
  it("splits the store title into the brand name and the subtitle", () => {
    expect(splitTitle("Tidy: Daily Planner Todo")).toEqual(["Tidy", "Daily Planner Todo"]);
    expect(splitTitle("Calm - Sleep and Meditation")).toEqual(["Calm", "Sleep and Meditation"]);
    expect(splitTitle("Notion")).toEqual(["Notion", ""]);
  });
  it("keeps only https pictures and drops the tracking query from the store link", () => {
    expect(listing.name).toBe("Tidy");
    expect(listing.screenshots).toEqual(["https://is1-ssl.mzstatic.com/s1.png", "https://is1-ssl.mzstatic.com/s2.png"]);
    expect(listing.url).toBe("https://apps.apple.com/us/app/tidy/id1234567");
    expect(appProfession(listing)).toBe("productivity app");
  });
  it("is null when Apple has no app with that id", () => {
    expect(toListing({ resultCount: 0, results: [] }, "us")).toBeNull();
  });
  it("opens on the description's first line", () => {
    expect(openingLine(listing.description)).toBe("Plan your day on one timeline. Move a task and the rest follow.");
    const long = `${"Word ".repeat(20)}ends here. ${"More ".repeat(40)}`;
    expect(openingLine(long).length).toBeLessThanOrEqual(160);
    expect(openingLine(long)).toMatch(/ends here\.$/);
  });
});

describe("proof lines", () => {
  it("states the genre, price and rating with its count and date, each fitting a fact", () => {
    const lines = proofLines(listing, new Date("2026-11-05T00:00:00Z"));
    expect(lines).toEqual([
      "Tidy is a productivity app on the App Store",
      "Tidy is free to download on the App Store",
      "Tidy is rated 4.8 out of 5 from 168,503 App Store ratings (US store, Nov 2026)",
    ]);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(FACT_CHARS);
  });
  it("claims no rating from a handful of ratings, and a paid app says its price", () => {
    const lines = proofLines({ ...listing, ratings: 7, price: "$4.99" });
    expect(lines.some((l) => l.includes("rated"))).toBe(false);
    expect(lines).toContain("Tidy costs $4.99 on the App Store");
  });
});

describe("complaints", () => {
  it("keeps 1 and 2 star reviews in the reviewer's words, short enough for a fact", () => {
    const raw = feed(
      review("r1", 1, "Useless", "Moving one task breaks my whole day and I have to redo everything. Also other things."),
      review("r2", 5, "Love it", "Best planner I have used."),
      review("r3", 2, "Too pricey for what it does", "Meh."),
      review("r4", 3, "Fine", "It is fine I guess, nothing special at all."),
    );
    const out = toComplaints(raw, "Rival", "Productivity");
    expect(out.map((c) => c.id)).toEqual(["r1", "r3"]);
    // a one-word title gives way to the body; a title that names the problem wins over the body
    expect(out[0].text).toBe("Moving one task breaks my whole day and I have to redo everything.");
    expect(out[1].text).toBe("Too pricey for what it does");
    expect(toComplaints(feed(review("r5", 1, "Customer service is terrible", "I have used planners for years and years.")), "Rival", "")[0].text).toBe("Customer service is terrible");
    for (const c of out) expect(painFact("Productivity", c.text).length).toBeLessThanOrEqual(FACT_CHARS);
  });
  it("cuts a long first sentence on a word", () => {
    const out = toComplaints(feed(review("r1", 1, "t", `I ${"really ".repeat(40)}hate it`)), "Rival", "Productivity");
    expect(out[0].text.endsWith("...")).toBe(true);
    expect(painFact("Productivity", out[0].text).length).toBeLessThanOrEqual(FACT_CHARS);
  });
  it("leaves out a quote that carries a link or a handle", () => {
    const raw = feed(review("r1", 1, "Just use www.other.example instead", "x"), review("r2", 1, "Go to rival.app it is better", "x"), review("r3", 1, "DM @someone for a refund", "x"), review("r4", 1, "Paywall after one day", "x"));
    expect(toComplaints(raw, "Rival", "").map((c) => c.id)).toEqual(["r4"]);
  });
  it("reads a feed with a single review, which Apple sends as an object", () => {
    expect(toComplaints({ feed: { entry: review("r1", 1, "Crashes on open every single time", "x") } }, "Rival", "")).toHaveLength(1);
  });
});

describe("the reads", () => {
  const answer = (body: unknown, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) } as Response);
  const fake = (routes: Record<string, unknown>) => ((url: string) => {
    const hit = Object.keys(routes).find((k) => url.includes(k));
    return hit ? answer(routes[hit]) : answer({}, false);
  }) as unknown as typeof fetch;

  it("reads the listing, apps like it (other sellers with ratings) and a mix of their complaints", async () => {
    const f = fake({
      "/lookup?id=1234567&country=us": LOOKUP,
      "/search?term=Daily%20Planner%20Todo": {
        results: [
          { trackId: 1234567, trackName: "Tidy: Daily Planner Todo", sellerName: "Tidy Labs", userRatingCount: 9999 },
          { trackId: 2, trackName: "Same Seller App", sellerName: "Tidy Labs", userRatingCount: 9999 },
          { trackId: 3, trackName: "Tiny App", sellerName: "X", userRatingCount: 3 },
          { trackId: 4, trackName: "Rival One: Planner", sellerName: "A", userRatingCount: 900 },
          { trackId: 5, trackName: "Rival Two", sellerName: "B", userRatingCount: 900 },
        ],
      },
      "/id=4/": feed(review("a1", 1, "t", "Rival one lost all my tasks after the update."), review("a2", 2, "t", "Rival one nags me to pay every single day.")),
      "/id=5/": feed(review("b1", 1, "t", "Rival two will not sync with my calendar at all.")),
    });
    const l = await readListing({ id: 1234567, country: "us" }, f);
    expect(l?.name).toBe("Tidy");
    const rivals = await readRivals(l!, f);
    expect(rivals.map((r) => r.name)).toEqual(["Rival One", "Rival Two"]);
    const complaints = await readComplaints(rivals, l!, f);
    expect(complaints.map((c) => c.id)).toEqual(["a1", "b1", "a2"]);
    expect(complaints.length).toBeLessThanOrEqual(MAX_COMPLAINTS);
  });

  it("gives no apps and no complaints when the search or a feed fails, instead of failing the read", async () => {
    const f = fake({});
    expect(await readRivals(listing, f)).toEqual([]);
    expect(await readComplaints([{ id: 9, name: "Gone", icon: null }], listing, f)).toEqual([]);
  });
});

describe("what gets saved", () => {
  it("adds the ticked proof lines, then the ticked complaints as facts", () => {
    const read = {
      listing,
      rivals: [],
      complaints: [
        { id: "a1", app: "Rival One", stars: 1, text: "Lost all my tasks" },
        { id: "b1", app: "Rival Two", stars: 1, text: "Will not sync" },
      ],
      proof: ["Tidy is free to download on the App Store"],
      pains: ["b1"],
    };
    expect(isAppRead(read)).toBe(true);
    expect(appFacts(read)).toEqual(["Tidy is free to download on the App Store", 'Users of other productivity apps complain: "Will not sync"']);
    expect(isAppRead({ ...read, pains: [1] })).toBe(false);
  });
});

describe("the cards' starting values", () => {
  it("takes the store's name and icon, and the site's colour, accounts and voice", () => {
    const site = { url: "https://tidy.example", name: "Tidy Labs", colour: "#ff0000", logo: "https://tidy.example/logo.png", handles: { tiktok: "tidyapp" }, oneLiner: "", audience: "working-adult" as const, audienceDetail: "busy parents", topics: ["planning"], edge: "one timeline", voice: "Warm." };
    const d = appDna(listing, site);
    expect(d).toMatchObject({ url: "https://tidy.example", name: "Tidy", logo: listing.icon, colour: "#ff0000", handles: { tiktok: "tidyapp" }, voice: "Warm.", topics: ["planning"] });
    expect(d.oneLiner).toBe(openingLine(listing.description));
  });
  it("stands on the store alone when the app has no website read", () => {
    expect(appDna(listing, null)).toMatchObject({ url: listing.url, name: "Tidy", colour: null, handles: {}, audience: "general", topics: ["Productivity"] });
  });
});
