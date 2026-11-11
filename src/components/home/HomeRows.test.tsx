// Home's rows under "Ask the agent for": each row's empty and filled states drawn from props, the picks behind them
// (formats taken in turn, competitors' longest-running ads, the next booked post, the AdLauncher line), and the
// default export reading this device's competitor stores.
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FormatDef } from "@/data/formats";
import type { StaticFormat } from "@/data/staticFormats";
import type { CompetitorAd } from "@/lib/competitorAds";
import { competitorAdsKey } from "@/lib/competitorAds";
import { competitorsKey, type Competitor } from "@/lib/competitors";
import type { DraftEntry } from "@/lib/draftHistory";
import { brandDevice } from "@/test/brandDevice";
import HomeRows, { PublishPromote, RecentCreations, RemixCompetitorAd, StartFromFormat, adsLine, bookedWhen, homeFormats, longestRunning, nextBooked } from "./HomeRows";

vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", supabase: {} }));

const NOW = Date.parse("2026-11-11T04:00:00Z");
const html = (el: ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>).replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
const words = (out: string) => out.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const hrefs = (out: string) => [...out.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

const draft = (id: string, o: Partial<DraftEntry> = {}): DraftEntry =>
  ({ id, createdAt: "2026-11-01T00:00:00Z", hook: `Hook ${id}`, draft: "", pillar: "", pillarDetail: "", audience: "", format: "", platform: "", ctaType: "", ...o });
const comp = (id: string, name: string, fb: string | null = "1234567"): Competitor =>
  ({ id, name, site: null, logo: null, why: "", fbPageId: fb, handles: {}, adsCountry: "SG", source: "typed", addedAt: "2026-10-01T00:00:00Z" }) as Competitor;
const ad = (id: string, start: string | null, active = true): CompetitorAd =>
  ({ id, format: "image", headline: null, body: "", cta: null, link: null, image: null, video: null, start, end: null, active, platforms: ["facebook"], versions: 1 }) as CompetitorAd;
const entry = (ads: CompetitorAd[]) => ({ checkedAt: "2026-11-10T00:00:00Z", pageId: null, pageName: null, ads, seen: [], fresh: [] });

afterEach(() => vi.unstubAllGlobals());

describe("Recent creations", () => {
  it("says nothing is made yet, with the Library link, when the brand has no posts", () => {
    const out = html(<RecentCreations drafts={[]} />);
    expect(words(out)).toContain("Nothing made yet.");
    expect(hrefs(out)).toEqual(["/library"]);
  });

  it("shows the latest 5 posts, each opening in Write", () => {
    const out = html(<RecentCreations drafts={["a", "b", "c", "d", "e", "f", "g"].map((id) => draft(id, id === "b" ? { status: "scheduled" } : {}))} />);
    expect(hrefs(out)).toEqual(["/library", ...["a", "b", "c", "d", "e"].map((id) => `/generate?draft=${id}`)]);
    expect(words(out)).toContain("scheduled Hook b");
    expect(words(out)).not.toContain("Hook f");
  });
});

describe("Start from a format", () => {
  const fmt = (slug: string, group: 1 | 2 | 3 | 4, ready = true) =>
    ({ slug, name: slug, blurb: `${slug} line`, kind: "video", group, section: "words", price: () => null, ready, to: () => `/x/${slug}` }) as FormatDef;
  const still = (slug: string, ready: boolean): StaticFormat => ({ slug, name: slug, blurb: `${slug} line`, ready });
  const video = [fmt("v3", 3), fmt("v1", 1), fmt("off", 1, false), ...["v4", "v5", "v6", "v7", "v8", "v9"].map((s) => fmt(s, 4))];

  it("takes 8 ready video formats in gallery order when no static ad is ready", () => {
    const tiles = homeFormats(video, [still("s1", false)]);
    expect(tiles.map((t) => t.key)).toEqual(["v1", "v3", "v4", "v5", "v6", "v7", "v8", "v9"]);
  });

  it("mixes ready static ads in, in turn with the video ones, linking to their own pages", () => {
    const tiles = homeFormats(video, [still("s1", true), still("s2", false), still("s3", true)]);
    expect(tiles.map((t) => t.key)).toEqual(["v1", "static-s1", "v3", "static-s3", "v4", "v5", "v6", "v7"]);
    expect(tiles[1].to).toBe("/make/static/s1");
  });

  it("draws each tile with its name and line, and All formats to /make", () => {
    const out = html(<StartFromFormat tiles={homeFormats(video, [])} />);
    expect(hrefs(out)).toEqual(["/make", "/x/v1", "/x/v3", "/x/v4", "/x/v5", "/x/v6", "/x/v7", "/x/v8", "/x/v9"]);
    expect(words(out)).toContain("v1 v1 line");
  });
});

describe("Remix a competitor ad", () => {
  const list = [comp("a", "Acme"), comp("b", "Beta"), comp("n", "No page", null)];
  const store = {
    a: entry([ad("a1", "2026-10-20"), ad("a2", "2026-01-01", false), ad("a3", null)]),
    b: entry([ad("b1", "2026-09-01"), ad("a1", "2026-10-20"), ad("b2", "2026-11-01"), ad("b3", "2026-10-01"), ad("b4", "2026-10-05")]),
    n: entry([ad("n1", "2025-01-01")]),
  };

  it("keeps running ads only, each once, from readable competitors, longest running first, 5 at most", () => {
    expect(longestRunning(list, store).map((x) => x.ad.id)).toEqual(["b1", "b3", "b4", "a1", "b2"]);
    expect(longestRunning(list, store, 10).map((x) => x.ad.id)).toEqual(["b1", "b3", "b4", "a1", "b2", "a3"]);
  });

  it("with no competitor: one line and Add a competitor", () => {
    const out = html(<RemixCompetitorAd watching={0} ads={[]} />);
    expect(words(out)).toContain("Watch a competitor to remix the ads they run. Add a competitor");
    expect(hrefs(out)).toEqual(["/competitors"]);
  });

  it("with competitors but nothing running: says so and opens Competitors", () => {
    const out = html(<RemixCompetitorAd watching={2} ads={[]} />);
    expect(words(out)).toContain("No running ads found yet. Open competitors");
  });

  it("each ad shows its advertiser and days running, opens on Competitors, and See all lists the running ones", () => {
    const out = html(<RemixCompetitorAd watching={2} ads={longestRunning(list, store, 2)} now={NOW} />);
    expect(words(out)).toContain("Beta 2 months running");
    expect(words(out)).toContain("Beta 41 days running");
    expect(hrefs(out)).toContain("/competitors?running=only");
    expect(hrefs(out)).toContain("/competitors?ad=b1");
  });

  it("reads the open brand's competitors and their stored ads", () => {
    brandDevice("u1");
    localStorage.setItem(competitorsKey("u1"), JSON.stringify({ list, dismissed: [] }));
    localStorage.setItem(competitorAdsKey("u1"), JSON.stringify(store));
    const out = words(html(<HomeRows userId="u1" drafts={[]} />));
    expect(out).toContain("Beta");
    expect(out).not.toContain("Watch a competitor");
  });
});

describe("Publish and promote", () => {
  it("picks the next scheduled post from today on, earliest first", () => {
    const drafts = [
      draft("past", { status: "scheduled", scheduledFor: "2026-11-10" }),
      draft("later", { status: "scheduled", scheduledFor: "2026-11-20T09:00" }),
      draft("posted", { status: "posted", scheduledFor: "2026-11-12" }),
      draft("soon", { status: "scheduled", scheduledFor: "2026-11-13T19:30" }),
    ];
    expect(nextBooked(drafts, "2026-11-11")?.id).toBe("soon");
    expect(nextBooked(drafts.slice(0, 3), "2026-11-21")).toBeNull();
  });

  it("names the day and, when picked, the time", () => {
    expect(bookedWhen("2026-11-13T19:30")).toBe("Fri 13 Nov, 7:30pm");
    expect(bookedWhen("2026-11-13")).toBe("Fri 13 Nov");
  });

  it("says whether AdLauncher is connected and how many ads went there", () => {
    expect(adsLine(undefined, 0)).toBe("Checking AdLauncher...");
    expect(adsLine(null, 2)).toBe("Couldn't check AdLauncher right now");
    expect(adsLine({ connected: true, account: null }, 0)).toBe("AdLauncher connected, no ads sent yet");
    expect(adsLine({ connected: true, account: null }, 1)).toBe("AdLauncher connected, 1 ad sent");
    expect(adsLine({ connected: true, account: null }, 3)).toBe("AdLauncher connected, 3 ads sent");
    expect(adsLine({ connected: false, account: null }, 0)).toBe("AdLauncher not connected");
    expect(adsLine({ connected: false, reconnect: true, account: null }, 0)).toBe("AdLauncher needs connecting again");
  });

  it("empty: not connected and nothing booked, with Open ads and Open calendar", () => {
    const out = html(<PublishPromote adl={{ connected: false, account: null }} sent={0} next={null} />);
    expect(words(out)).toContain("Ads AdLauncher not connected Open ads");
    expect(words(out)).toContain("Posting Nothing booked yet Open calendar");
    expect(hrefs(out)).toEqual(["/adlauncher", "/calendar"]);
  });

  it("filled: connected with ads sent, and when the next post goes out without repeating Coming up's title", () => {
    const next = draft("soon", { status: "scheduled", scheduledFor: "2026-11-13T19:30", hook: "Three CPF myths" });
    const out = words(html(<PublishPromote adl={{ connected: true, account: null }} sent={4} next={next} />));
    expect(out).toContain("AdLauncher connected, 4 ads sent");
    expect(out).toContain("Next one goes out Fri 13 Nov, 7:30pm");
    expect(out).not.toContain("Three CPF myths");
  });
});
