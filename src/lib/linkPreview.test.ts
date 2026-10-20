import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import handler from "../../api/page-og";
import NEWS from "@/data/industryNews.json";
import ADS_FILE from "@/data/adsSwipe.json";
import TRENDS from "@/data/trends.json";
import INSPIRATION from "@/data/inspiration.json";
import ADVISORS from "@/data/advisors.json";
import { SECTIONS } from "./nav";
import { getAllTopPosts } from "./topPosts";
import { PAGES, PREVIEW_BOTS, SITE_CARD, SITE_NAME, headHtml, pageName, previewFor } from "./linkPreview";

const q = (s = "") => new URLSearchParams(s);
const ASCII = /^[\x20-\x7E]+$/;
const local = (url: string) => `public${new URL(url).pathname}`;

describe("link previews", () => {
  it("names every nav page the way the nav does", () => {
    for (const s of SECTIONS) for (const p of s.pages) expect(pageName(p.to), p.to).toBe(p.title ?? p.label);
    // and every row is a page the nav still has
    const nav = new Set(SECTIONS.flatMap((s) => s.pages.map((p) => p.to)));
    for (const path of Object.keys(PAGES)) expect(nav.has(path), path).toBe(true);
  });

  it("gives an unlisted path its nearest listed page, and the site past that", () => {
    expect(pageName("/recruit/auto-dm/extra")).toBe(PAGES["/recruit/auto-dm"]);
    expect(pageName("/hub/trends")).toBeNull();
    expect(previewFor("/hub/trends", q()).title).toBe(SITE_NAME);
  });

  it("names each public post with its own words and picture", () => {
    const story = (NEWS as { id: string; title: string; clipping?: string }[]).find((s) => s.clipping)!;
    const ad = (ADS_FILE as { ads: { adId: string; advertiser: string }[] }).ads[0];
    const top = getAllTopPosts().find((p) => p.cover)!;
    const cases = [
      [previewFor("/swipe", q(`tab=news&story=${story.id}`)), story.clipping],
      [previewFor("/swipe", q(`tab=ads&ad=${ad.adId}`)), "ads"],
      [previewFor("/swipe", q(`post=${top.advisorId}-${top.shortCode}`)), top.cover],
    ] as const;
    for (const [p] of cases) {
      expect(p.ownCard).toBe(false);
      expect(existsSync(local(p.image)), p.image).toBe(true);
      expect(p.title).not.toBe(PAGES["/swipe"]);
    }
    expect(cases[0][0].image.endsWith(story.clipping!)).toBe(true);
    expect(cases[1][0].title).toContain(ad.advertiser);
    expect(cases[2][0].title).toContain(top.advisorName);

    const trend = (TRENDS as { id: string }[])[0];
    const ex = (INSPIRATION as { id: string }[])[0];
    const who = (ADVISORS as { id: string; name: string }[])[0];
    expect(previewFor("/trends", q(`trend=${trend.id}`)).title).not.toBe(PAGES["/trends"]);
    expect(previewFor(`/inspiration/${ex.id}`, q()).title).not.toBe(PAGES["/inspiration"]);
    expect(previewFor(`/profiles/${who.id}`, q()).title).toContain(who.name);
  });

  it("opens every Top posts key the swipe file opens", () => {
    for (const p of getAllTopPosts()) {
      expect(previewFor("/swipe", q(`post=${p.advisorId}-${p.shortCode}`)).title, p.shortCode).toContain(p.advisorName);
    }
  });

  it("keeps every preview plain ASCII and never empty", () => {
    const all = [
      ...(NEWS as { id: string }[]).map((s) => previewFor("/swipe", q(`tab=news&story=${s.id}`))),
      ...(ADS_FILE as { ads: { adId: string }[] }).ads.map((a) => previewFor("/swipe", q(`tab=ads&ad=${a.adId}`))),
      ...getAllTopPosts().map((p) => previewFor("/swipe", q(`post=${p.advisorId}-${p.shortCode}`))),
      ...(TRENDS as { id: string }[]).map((t) => previewFor("/trends", q(`trend=${t.id}`))),
      ...(INSPIRATION as { id: string }[]).map((e) => previewFor(`/inspiration/${e.id}`, q())),
      ...(ADVISORS as { id: string }[]).map((a) => previewFor(`/profiles/${a.id}`, q())),
      ...Object.keys(PAGES).map((path) => previewFor(path, q())),
    ];
    for (const p of all) {
      expect(p.title).toMatch(ASCII);
      expect(p.description).toMatch(ASCII);
      expect(p.title.length).toBeLessThanOrEqual(90);
      expect(p.description.length).toBeLessThanOrEqual(200);
    }
  });

  it("names a private post's page, never the post, and never prints the query", () => {
    const evil = "<b>Buy now</b>";
    for (const [path, query] of [
      ["/reels", `card=${evil}`],
      ["/swipe", `tab=ads&ad=${evil}`],
      ["/swipe", `post=${evil}`],
      ["/calendar", `post=${evil}`],
      ["/following", `post=${evil}`],
    ]) {
      const p = previewFor(path, q(query));
      expect(p.title).toBe(pageName(path));
      expect(p.image).toContain(SITE_CARD);
      expect(headHtml(p, "https://x/").includes("Buy now")).toBe(false);
    }
  });

  it("sends preview fetchers, and only them, to the function", () => {
    const rule = JSON.parse(readFileSync("vercel.json", "utf8")).rewrites.find((r: { destination: string }) => r.destination.startsWith("/api/page-og"));
    // Vercel anchors has.value as ^value$
    const re = new RegExp(`^${rule.has[0].value}$`);
    expect(rule.has[0].value).toBe(`.*(${PREVIEW_BOTS.join("|")}).*`);
    for (const ua of [
      "TelegramBot (like TwitterBot)",
      "WhatsApp/2.23.20.0 A",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
      "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    ]) expect(re.test(ua), ua).toBe(true);
    for (const ua of [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0",
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 Line/13.0.0",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    ]) expect(re.test(ua), ua).toBe(false);
  });

  it("answers with an absolute, escaped head that varies by user-agent", async () => {
    const story = (NEWS as { id: string; title: string }[])[0];
    const res = handler(new Request(`https://consultant-content-studio.vercel.app/api/page-og?path=swipe&tab=news&story=${story.id}`));
    const html = await res.text();
    expect(res.headers.get("vary")).toBe("User-Agent");
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(html).toContain(`property="og:url" content="https://consultant-content-studio.vercel.app/swipe?tab=news&amp;story=${story.id}"`);
    expect(html).toMatch(/property="og:image" content="https:\/\/consultant-content-studio\.vercel\.app\//);
    expect(html).not.toContain("path=");
    // the site card exists and the home path gets it
    expect(existsSync(`public${SITE_CARD}`)).toBe(true);
    expect(await handler(new Request("https://consultant-content-studio.vercel.app/api/page-og?path=")).text()).toContain(`og:title" content="${SITE_NAME}"`);
  });
});
