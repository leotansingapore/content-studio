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
});
