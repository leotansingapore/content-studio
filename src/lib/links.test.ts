import { describe, expect, it } from "vitest";
import { APP_ORIGIN, absolute, links, slug } from "./links";

describe("links", () => {
  it("builds the calendar links the team-posts job sends (docs/deep-links.md)", () => {
    expect(links.calendar({ business: "team-posts", view: "upcoming" })).toBe("/calendar?view=upcoming&business=team-posts");
    expect(links.calendar({ business: "team-posts", teampost: "tp3" })).toBe("/calendar?business=team-posts&teampost=tp3");
    expect(links.calendar({ month: "2026-11", platform: "instagram", status: "scheduled" })).toBe(
      "/calendar?platform=instagram&status=scheduled&month=2026-11",
    );
  });

  it("leaves defaults out, so an unchanged page has a clean address", () => {
    expect(links.calendar()).toBe("/calendar");
    expect(links.calendar({ view: "month", platform: "all" })).toBe("/calendar");
    expect(links.drafts({ platform: "all", pillar: "all", label: "all", q: "  " })).toBe("/drafts");
    expect(links.plan({ view: "plan" })).toBe("/plan");
    expect(links.reels({ archived: false })).toBe("/reels");
    expect(links.grid()).toBe("/grid");
  });

  it("encodes values and keeps the item params", () => {
    expect(links.drafts({ q: "cpf & you", review: "d1" })).toBe("/drafts?q=cpf+%26+you&review=d1");
    expect(links.reels({ brand: "moneybees", archived: true, card: "c1", t: 12 })).toBe("/reels?brand=moneybees&archived=show&card=c1&t=12");
    // the AT newsjack job's Telegram link: card last, so a chat app cutting at the ~ keeps the rest
    expect(links.reels({ brand: "activitytracker", view: "feed", stage: "scheduled", card: "at-1019-car1~carousel" })).toBe(
      "/reels?brand=activitytracker&view=feed&stage=scheduled&card=at-1019-car1%7Ecarousel",
    );
    expect(links.reels({ stage: "review" })).toBe("/reels");
    expect(links.reels({ stage: "notes" })).toBe("/reels?stage=notes");
    // the Calendar's waiting-post links: All when one needs changes, and a post carries its own brand
    expect(links.reels({ brand: "finternship", stage: "all" })).toBe("/reels?brand=finternship&stage=all");
    expect(links.reels({ card: "c9", brand: "radiant" })).toBe("/reels?brand=radiant&card=c9");
    expect(links.board({ business: "moneybees", feed: "f1" })).toBe("/board?business=moneybees&feed=f1");
    expect(links.plan({ view: "setup", competitor: "@leo" })).toBe("/plan?view=setup&competitor=%40leo");
  });

  it("slugs business chip labels the way ?business= reads them", () => {
    expect(slug("Team posts")).toBe("team-posts");
    expect(slug("MoneyBees")).toBe("moneybees");
    expect(slug("  FINternship (SG) ")).toBe("finternship-sg");
  });

  it("makes links absolute on the production host outside a browser", () => {
    expect(absolute(links.calendar({ teampost: "tp3" }))).toBe(`${APP_ORIGIN}/calendar?teampost=tp3`);
  });

  it("builds the Grow, Discover and settings links in docs/deep-links.md", () => {
    expect(links.inspiration({ pillar: ["authority", "tip"], saved: true, q: " cpf " })).toBe("/inspiration?q=cpf&pillar=authority,tip&saved=only");
    expect(links.profiles({ company: ["aia", "none"] })).toBe("/profiles?company=aia,none");
    expect(links.inspirationPost("a b")).toBe("/inspiration/a%20b");
    expect(links.swipe({ tab: "news", topic: "scams" })).toBe("/swipe?tab=news&topic=scams");
    expect(links.swipe({ post: "the-woke-salaryman-instagram-Ddkxv39j961" })).toBe("/swipe?post=the-woke-salaryman-instagram-Ddkxv39j961");
    expect(links.trends({ trend: "t1" })).toBe("/trends?trend=t1");
    expect(links.analytics({ period: "7d", rank: "engagement-rate" })).toBe("/analytics?period=7d&rank=engagement-rate");
    expect(links.autoDm({ log: "a1", status: "failed" })).toBe("/recruit/auto-dm?log=a1&status=failed");
    expect(links.autoDm({ log: "a1", status: "all" })).toBe("/recruit/auto-dm?log=a1");
    expect(links.team({ status: "changes-requested" })).toBe("/team?status=changes-requested");
    expect(links.hubAdmin({ tab: "members" })).toBe("/hub/admin?tab=members");
  });

  it("builds every post's own link (docs/deep-links.md, Every post has a link)", () => {
    expect(links.swipe({ tab: "news", story: "ddb48f3587f1" })).toBe("/swipe?tab=news&story=ddb48f3587f1");
    expect(links.swipe({ tab: "ads", ad: "2095783381019179" })).toBe("/swipe?tab=ads&ad=2095783381019179");
    expect(links.following({ post: "instagram:C8xYz12AbCd" })).toBe("/following?post=instagram%3AC8xYz12AbCd");
    expect(links.market({ post: "tiktok:7300000000000000000" })).toBe("/market?post=tiktok%3A7300000000000000000");
    expect(links.market({ show: "act", view: "digest" })).toBe("/market");
    expect(links.team({ post: "6f1c2d3e" })).toBe("/team?post=6f1c2d3e");
    expect(links.hubTrends({ trend: "6f1c2d3e" })).toBe("/hub/trends?trend=6f1c2d3e");
    expect(links.reels({ card: "at-1016-car4~carousel" })).toBe("/reels?card=at-1016-car4%7Ecarousel");
  });

  it("leaves the Grow pages' defaults out", () => {
    expect(links.swipe({ tab: "posts", format: "all", from: "all", topic: "all", angle: "all", audience: "all", saved: false })).toBe("/swipe");
    expect(links.analytics({ period: "30d", by: "platform", time: "all", rank: "engagements" })).toBe("/analytics");
    expect(links.trackedLinks({ period: "30d" })).toBe("/links");
    expect(links.engage({ tool: "replies" })).toBe("/recruit/engage");
    expect(links.team({ status: "pending" })).toBe("/team");
    expect(links.inspiration({ pillar: [], platform: [] })).toBe("/inspiration");
    expect(links.hubAdmin({ tab: "clients" })).toBe("/hub/admin");
  });

  it("builds the Competitors links (docs/deep-links.md, Phase 2: /competitors)", () => {
    expect(links.competitors()).toBe("/competitors");
    // ads is the default once a competitor exists, so links leave it out
    expect(links.competitors({ view: "ads", running: false })).toBe("/competitors");
    expect(links.competitors({ view: "list" })).toBe("/competitors?view=list");
    expect(links.competitors({ view: "list", edit: "c-lq3k9z" })).toBe("/competitors?view=list&edit=c-lq3k9z");
    expect(links.competitors({ c: "c-lq3k9z", running: true })).toBe("/competitors?c=c-lq3k9z&running=only");
    expect(links.competitors({ view: "posts", c: "c-lq3k9z", platform: "tiktok", sort: "newest" })).toBe(
      "/competitors?view=posts&c=c-lq3k9z&platform=tiktok&sort=newest",
    );
    expect(links.competitors({ view: "posts", sort: "views" })).toBe("/competitors?view=posts&sort=views");
    expect(links.competitors({ ad: "2095783381019179" })).toBe("/competitors?ad=2095783381019179");
    expect(links.competitors({ view: "posts", post: "instagram:C9xYz" })).toBe("/competitors?view=posts&post=instagram%3AC9xYz");
  });

  it("builds the phase-2 swipe tabs with each tab's default left out", () => {
    expect(links.swipe({ tab: "foryou" })).toBe("/swipe?tab=foryou");
    expect(links.swipe({ tab: "foryou", kind: "organic", hidden: true })).toBe("/swipe?tab=foryou&kind=organic&hidden=only");
    expect(links.swipe({ tab: "foryou", kind: "all", hidden: false })).toBe("/swipe?tab=foryou");
    // reach is the search tab's default sort, so the spec's sort=reach stays out
    expect(links.swipe({ tab: "search", q: "cpf", sort: "reach" })).toBe("/swipe?tab=search&q=cpf");
    expect(links.swipe({ tab: "search", q: "cpf", platform: "tiktok", sort: "views", posted: "30d" })).toBe(
      "/swipe?tab=search&q=cpf&sort=views&platform=tiktok&posted=30d",
    );
    expect(links.swipe({ tab: "search", platform: "all", posted: "90d" })).toBe("/swipe?tab=search");
    expect(links.swipe({ tab: "search", posted: "any" })).toBe("/swipe?tab=search&posted=any");
    // reach only drops on the search tab: Top posts reads sort with its own list
    expect(links.swipe({ sort: "reach" })).toBe("/swipe?sort=reach");
    expect(
      links.swipe({ tab: "ads", scope: "space", hook: "problem", running: true, run: "30", format: "video", platform: "instagram", emotion: "worry", audience: "parents", sort: "longest" }),
    ).toBe("/swipe?tab=ads&format=video&audience=parents&sort=longest&scope=space&hook=problem&running=only&run=30&platform=instagram&emotion=worry");
    expect(links.swipe({ tab: "ads", scope: "all", hook: "all", emotion: "all", sort: "relevant", running: false })).toBe("/swipe?tab=ads");
    expect(links.swipe({ tab: "ads", scope: "sg", industry: "banking" })).toBe("/swipe?tab=ads&industry=banking&scope=sg");
    // the open ad stays last, under the filters
    expect(links.swipe({ tab: "ads", scope: "c-lq3k9z", q: "cpf", ad: "2095783381019179" })).toBe(
      "/swipe?tab=ads&q=cpf&scope=c-lq3k9z&ad=2095783381019179",
    );
    expect(links.swipe({ tab: "hooks", formula: "myth-bust", why: "fear-of-loss", q: "cpf" })).toBe(
      "/swipe?tab=hooks&q=cpf&why=fear-of-loss&formula=myth-bust",
    );
    expect(links.swipe({ tab: "hooks", formula: "all", why: "all" })).toBe("/swipe?tab=hooks");
  });

  it("builds the Saved links (docs/deep-links.md, Phase 2: /saved)", () => {
    expect(links.saved()).toBe("/saved");
    expect(links.saved({ board: "b-lq3k9z" })).toBe("/saved?board=b-lq3k9z");
    expect(links.saved({ board: "unsorted" })).toBe("/saved?board=unsorted");
    expect(links.saved({ platform: "tiktok", q: " cpf " })).toBe("/saved?platform=tiktok&q=cpf");
    expect(links.saved({ item: "link:tiktok:7412345678901234567" })).toBe("/saved?item=link%3Atiktok%3A7412345678901234567");
    expect(links.saved({ hook: "myth-bust" })).toBe("/saved?hook=myth-bust");
    expect(links.saved({ angle: "contrarian", topic: "cpf", emotion: "worry", audience: "parents", format: "reel" })).toBe(
      "/saved?angle=contrarian&topic=cpf&emotion=worry&audience=parents&format=reel",
    );
    expect(links.saved({ board: "b-lq3k9z", platform: "ad", hook: "myth-bust", item: "ad:2095783381019179" })).toBe(
      "/saved?board=b-lq3k9z&platform=ad&hook=myth-bust&item=ad%3A2095783381019179",
    );
    expect(links.saved({ item: "link:tiktok:7412345678901234567", breakdown: true })).toBe(
      "/saved?item=link%3Atiktok%3A7412345678901234567#breakdown",
    );
    // a breakdown needs an open item
    expect(links.saved({ breakdown: true, hook: "all" })).toBe("/saved");
  });

  it("builds the phase-2 Trends, Profiles, Following and Home links", () => {
    expect(links.trends({ view: "kits" })).toBe("/trends");
    expect(links.trends({ view: "search" })).toBe("/trends?view=search");
    expect(links.trends({ view: "hashtags" })).toBe("/trends?view=hashtags");
    expect(links.trends({ view: "search", show: "rising" })).toBe("/trends?view=search&show=rising");
    expect(links.trends({ view: "search", show: "gap" })).toBe("/trends?view=search&show=gap");
    expect(links.trends({ view: "search", topic: "cpf-life" })).toBe("/trends?view=search&topic=cpf-life");
    expect(links.trends({ view: "hashtags", tag: "moneytok" })).toBe("/trends?view=hashtags&tag=moneytok");
    expect(links.trends({ platform: "tiktok", trend: "t1" })).toBe("/trends?platform=tiktok&trend=t1");
    expect(links.profiles({ sort: "for-you" })).toBe("/profiles?sort=for-you");
    expect(links.profiles({ niche: ["cpf-and-retirement"], sort: "for-you" })).toBe("/profiles?niche=cpf-and-retirement&sort=for-you");
    expect(links.profile("the-astute-parent-youtube")).toBe("/profiles/the-astute-parent-youtube");
    expect(links.profile("the-astute-parent-youtube", { works: true })).toBe("/profiles/the-astute-parent-youtube#works");
    expect(links.following({ account: "instagram:sleekflow", view: "patterns" })).toBe("/following?account=instagram%3Asleekflow&view=patterns");
    expect(links.following()).toBe("/following");
    expect(links.home()).toBe("/home");
    expect(links.home({ section: "what-moved" })).toBe("/home#what-moved");
  });

  it("builds the Create pages' links with defaults left out (docs/deep-links.md, Create pages)", () => {
    expect(links.generate({ draft: "d1", step: "topic" })).toBe("/generate?draft=d1");
    expect(links.generate({ step: "format", panel: "shortcuts" })).toBe("/generate?step=format&panel=shortcuts");
    expect(links.generate({ pillar: "topic", detail: "CPF at 35", platform: "linkedin" })).toBe(
      "/generate?pillar=topic&detail=CPF+at+35&platform=linkedin",
    );
    expect(links.batch({ pillar: "topic", audience: "general" })).toBe("/generate/batch");
    expect(links.batch({ pillar: "market", audience: "parent" })).toBe("/generate/batch?pillar=market&audience=parent");
    expect(links.carousel({ tab: "drafts" })).toBe("/carousel");
    expect(links.carousel({ tab: "saved", carousel: "d:abc" })).toBe("/carousel?tab=saved&carousel=d%3Aabc");
    expect(links.edit({ tab: "style", mode: "fix" })).toBe("/edit");
    expect(links.edit({ p: "v1", tab: "stickers", sticker: "o1", guide: "tiktok" })).toBe("/edit?p=v1&tab=stickers&sticker=o1&guide=tiktok");
    expect(links.edit({ panel: ["join", "ai"], kind: "montage", template: "handheld-ugc-vlog" })).toBe(
      "/edit?panel=join,ai&kind=montage&template=handheld-ugc-vlog",
    );
    expect(links.clone({ clone: "instagram:C1" })).toBe("/clone?clone=instagram%3AC1");
    expect(links.coach({ report: "r1" })).toBe("/coach?report=r1");
    expect(links.coach({ section: "idea-dump" })).toBe("/coach#idea-dump");
    expect(links.media({ q: " cpf ", folder: "none" })).toBe("/media?q=cpf&folder=none");
    expect(links.academy({ lesson: "0Q1AQAxpdGg" })).toBe("/academy?lesson=0Q1AQAxpdGg");
    expect(links.brand({ section: "logo" })).toBe("/brand#logo");
    expect(links.createGuide({ step: "reel" })).toBe("/create-guide#reel");
    expect(links.tutorial()).toBe("/tutorial");
  });
});
