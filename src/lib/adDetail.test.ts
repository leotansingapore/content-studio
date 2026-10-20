import { describe, expect, it } from "vitest";
import { ADS, buildAdWriteUrl } from "./adsSwipe";
import { competitorLibraryAd, dropLibraryAd } from "./adLibrary";
import { type DetailAd, placementLabel, proofLine, rankAmong, remixWriteUrl, runLength, startedLabel, titleOf, toDetailAd } from "./adDetail";

const NOW = Date.parse("2026-10-20T04:00:00Z");
const dayBefore = (n: number) => new Date(NOW - n * 86_400_000).toISOString().slice(0, 10);
const D = (id: string, extra: Partial<DetailAd> = {}): DetailAd => ({
  id, advertiser: "Acme", format: "image", headline: "Hi", body: "Body", start: dayBefore(20), end: null, active: true, platforms: ["facebook"], image: null,
  video: null, libraryUrl: `https://www.facebook.com/ads/library/?id=${id}`, hookFamily: null, emotion: null, audience: null, cta: null, link: null, industry: null, ...extra,
});
const DROP = ADS.map(toDetailAd);
const of = (advertiser: string) => DROP.filter((a) => a.advertiser === advertiser);

describe("runLength", () => {
  it("counts days under 60, whole months to 364, whole years from 365", () => {
    const at = (days: number) => runLength(D("1", { start: dayBefore(days) }), NOW)?.big;
    expect(at(59)).toBe("59 days");
    expect(at(60)).toBe("2 months");
    expect(at(364)).toBe("12 months");
    expect(at(365)).toBe("1 year");
    expect(at(730)).toBe("2 years");
    expect(at(1)).toBe("1 day");
    expect(runLength(D("1"), NOW)?.small).toBe("running");
  });

  it("measures a stopped ad from start to end and says ran; nothing without a start", () => {
    expect(runLength(D("1", { active: false, start: dayBefore(50), end: dayBefore(5) }), NOW)).toEqual({ big: "45 days", small: "ran" });
    expect(runLength(D("1", { start: null }), NOW)).toBeNull();
    // Thomson Medical's video from 23 Dec 2025
    expect(runLength(DROP.find((a) => a.id === "908248645187707")!, NOW)).toEqual({ big: "10 months", small: "running" });
  });
});

describe("rankAmong", () => {
  it("gives Prudential's three drop ads Longest, 2nd longest and #3, and Singlife's three Joint longest", () => {
    const pru = of("Prudential Singapore");
    expect(pru.map((a) => [a.start, rankAmong(a, DROP, NOW)])).toEqual([
      ["2026-09-16", { big: "Longest", small: "of their 3 ads" }],
      ["2026-10-04", { big: "2nd longest", small: "of their 3 ads" }],
      ["2026-10-05", { big: "#3", small: "of their 3 ads" }],
    ]);
    for (const a of of("Singlife")) expect(rankAmong(a, DROP, NOW)).toEqual({ big: "Joint longest", small: "of their 3 ads" });
  });

  it("says Only ad for one, counting only the same advertiser in the list it was opened from", () => {
    const list = [D("1", { start: dayBefore(30) }), D("2", { start: dayBefore(20) }), D("3", { start: dayBefore(10) }), D("4", { advertiser: "Other", start: dayBefore(99) })];
    expect(list.map((a) => rankAmong(a, list, NOW).big)).toEqual(["Longest", "2nd longest", "#3", "Only ad"]);
    expect(rankAmong(list[3], list, NOW)).toEqual({ big: "Only ad", small: "of theirs here" });
    expect(rankAmong(D("5", { advertiser: "acme ", start: dayBefore(40) }), list, NOW)).toEqual({ big: "Longest", small: "of their 4 ads" });
    expect(rankAmong(D("6", { start: dayBefore(30) }), [D("7", { start: dayBefore(30) })], NOW).big).toBe("Joint longest");
  });
});

describe("placementLabel", () => {
  it("reads the drop's FACEBOOK and the scraper's facebook alike, joins with and, drops unknown values", () => {
    expect(placementLabel(["FACEBOOK", "INSTAGRAM", "THREADS"])).toBe("Facebook, Instagram and Threads");
    expect(placementLabel(["facebook", "instagram"])).toBe("Facebook and Instagram");
    expect(placementLabel(["facebook", "martian", "FACEBOOK"])).toBe("Facebook");
    expect(placementLabel(["audience_network", "WHATSAPP", "messenger"])).toBe("Audience Network, WhatsApp and Messenger");
    expect(placementLabel([])).toBe("");
  });
});

describe("proofLine", () => {
  const two = (mine: number, other: number) => {
    const a = D("1", { start: dayBefore(mine) });
    return proofLine(a, [a, D("2", { start: dayBefore(other) })], NOW);
  };
  it("returns each of its seven lines", () => {
    expect(two(34, 10)).toBe("Their longest running ad right now.");
    expect(two(120, 200)).toBe("Running for 3+ months. Advertisers switch off ads that lose money.");
    expect(two(40, 50)).toBe("Running for a month or more.");
    expect(two(5, 50)).toBe("New. Too early to call it proven.");
    expect(two(20, 50)).toBe("Running for 2 weeks or more.");
    expect(proofLine(D("1", { active: false, start: dayBefore(200), end: dayBefore(50) }), [], NOW)).toBe("Ran for 3+ months before it stopped.");
    expect(proofLine(D("1", { active: false, start: dayBefore(50), end: dayBefore(5) }), [], NOW)).toBe("Stopped after 45 days.");
  });

  it("never gives a stopped ad a Running line, nor a longest line under 30 days", () => {
    const stopped = D("1", { active: false, start: dayBefore(50), end: dayBefore(5) });
    expect(proofLine(stopped, [stopped, D("2", { start: dayBefore(2) })], NOW)).not.toMatch(/^Running|longest/);
    expect(two(20, 10)).toBe("Running for 2 weeks or more.");
    expect(proofLine(D("1", { start: null }), [], NOW)).toBeNull();
  });
});

describe("the drawer's Remix and labels", () => {
  it("asks Write for a script on a video ad, and keeps an image ad's link as the cards build it", () => {
    const image = ADS.find((a) => a.format === "image")!;
    expect(remixWriteUrl(toDetailAd(image))).toBe(buildAdWriteUrl(image));
    const video = ADS.find((a) => a.format === "video")!;
    expect(remixWriteUrl(toDetailAd(video))).toBe(`${buildAdWriteUrl(video)}&format=short-video`);
    expect(new URLSearchParams(remixWriteUrl(toDetailAd(video)).split("?")[1]).get("format")).toBe("short-video");
  });

  it("maps a drop ad and a library ad to the same shape", () => {
    for (const a of ADS.slice(0, 6)) expect(toDetailAd(dropLibraryAd(a, undefined, NOW))).toEqual(toDetailAd(a));
    const lib = competitorLibraryAd(
      { id: "977824304753041", format: "video", headline: null, body: "First line\nSecond", cta: null, link: null, image: null, video: "https://video.example/v.mp4",
        start: "2026-10-01", end: "2026-10-10", active: false, platforms: ["facebook"], versions: 2 },
      { id: "c", name: "SleekFlow" }, { hook: "proof", emotion: "trust", audience: null }, false, NOW,
    );
    const d = toDetailAd(lib);
    expect(Object.keys(d).sort()).toEqual(Object.keys(toDetailAd(ADS[0])).sort());
    expect(d).toMatchObject({ id: "977824304753041", advertiser: "SleekFlow", hookFamily: "Proof", emotion: "trust", video: "https://video.example/v.mp4", active: false, end: "2026-10-10" });
    expect(titleOf(d)).toBe("First line");
  });

  it("dates the start without the year in the current year", () => {
    expect(startedLabel("2026-09-10", NOW)).toBe("10 Sep");
    expect(startedLabel("2025-12-23", NOW)).toBe("23 Dec 2025");
    expect(startedLabel(null, NOW)).toBeNull();
  });
});
