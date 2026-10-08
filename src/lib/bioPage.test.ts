import { describe, expect, it } from "vitest";
import {
  clickHref,
  clickTotals,
  isValidLinkUrl,
  linkProblem,
  normalizeSlug,
  publicPageUrl,
  sgDay,
  slugProblem,
  withScheme,
} from "./bioPage";

describe("slugs", () => {
  it("turns a name into an address", () => {
    expect(normalizeSlug("Ada Tan, CFP")).toBe("ada-tan-cfp");
    expect(normalizeSlug("  José  Lim!! ")).toBe("jose-lim");
    expect(normalizeSlug("-".repeat(5) + "x".repeat(60))).toHaveLength(40);
  });
  it("matches the database's rules, reserved words included", () => {
    expect(slugProblem("ada-tan")).toBeNull();
    expect(slugProblem("ab")).toMatch(/3 to 40/);
    expect(slugProblem("ada-")).toMatch(/3 to 40/);
    expect(slugProblem("Ada")).toMatch(/3 to 40/);
    expect(slugProblem("admin")).toMatch(/reserved/);
    expect(slugProblem("review")).toMatch(/reserved/);
    expect(slugProblem("team")).toMatch(/reserved/);
  });
});

describe("link URLs", () => {
  it("adds https:// to a bare address and keeps a typed scheme", () => {
    expect(withScheme("calendly.com/ada")).toBe("https://calendly.com/ada");
    expect(withScheme("http://example.com")).toBe("http://example.com");
    expect(withScheme("javascript:alert(1)")).toBe("javascript:alert(1)");
  });
  it("accepts plain web addresses only, like the database", () => {
    expect(isValidLinkUrl("https://wa.me/6591234567?text=Hi")).toBe(true);
    expect(isValidLinkUrl("https://xn--bcher-kva.example:8443/a#b")).toBe(true);
    expect(isValidLinkUrl("javascript:alert(1)")).toBe(false);
    expect(isValidLinkUrl("https://bank.com@evil.example")).toBe(false);
    expect(isValidLinkUrl("https://example.com\\@evil.example")).toBe(false);
    expect(isValidLinkUrl("https://exa mple.com")).toBe(false);
    expect(isValidLinkUrl("https://bücher.example")).toBe(false);
    expect(isValidLinkUrl("https://example.com/" + "a".repeat(2040))).toBe(false);
  });
  it("names the first problem with a row", () => {
    expect(linkProblem({ label: " ", url: "https://x.com" })).toMatch(/label/);
    expect(linkProblem({ label: "Book", url: "javascript:alert(1)" })).toMatch(/web address/);
    expect(linkProblem({ label: "Book", url: "calendly.com/ada" })).toBeNull();
  });
});

describe("clicks", () => {
  it("counts by Singapore day", () => {
    // 2026-10-08 20:00 UTC is already 9 Oct in Singapore.
    const now = new Date("2026-10-08T20:00:00Z");
    expect(sgDay(now)).toBe("2026-10-09");
    expect(sgDay(now, 6)).toBe("2026-10-03");
  });
  it("totals per link from a day on", () => {
    const rows = [
      { page_id: "p", link_id: "a", day: "2026-10-01", count: 5 },
      { page_id: "p", link_id: "a", day: "2026-10-08", count: 2 },
      { page_id: "p", link_id: "b", day: "2026-10-09", count: 1 },
    ];
    const t = clickTotals(rows, "2026-10-03");
    expect(t.get("a")).toBe(2);
    expect(t.get("b")).toBe(1);
  });
  it("builds the public and redirect addresses", () => {
    expect(publicPageUrl("https://consultant-content-studio.vercel.app/", "ada-tan")).toBe(
      "https://consultant-content-studio.vercel.app/l/ada-tan",
    );
    expect(clickHref("ada-tan", "abc")).toMatch(/\/functions\/v1\/link-in-bio\/ada-tan\/abc$/);
  });
});
