import { describe, expect, it } from "vitest";
import { isBot, pageUrl, parsePath, safeJson, safeRedirectUrl } from "./logic";

const ID = "3f2b6c1e-8a4d-4c2b-9f1e-2a3b4c5d6e7f";

describe("parsePath", () => {
  it("reads a page and a link", () => {
    expect(parsePath("/link-in-bio/ada-tan")).toEqual({ slug: "ada-tan", linkId: null });
    expect(parsePath(`/functions/v1/link-in-bio/Ada-Tan/${ID}`)).toEqual({ slug: "ada-tan", linkId: ID });
  });
  it("refuses malformed slugs, ids and extra segments", () => {
    expect(parsePath("/link-in-bio/")).toBeNull();
    expect(parsePath("/link-in-bio/ab")).toBeNull();
    expect(parsePath("/link-in-bio/ada_tan")).toBeNull();
    expect(parsePath("/link-in-bio/ada-tan/not-a-uuid")).toBeNull();
    expect(parsePath(`/link-in-bio/ada-tan/${ID}/x`)).toBeNull();
    expect(parsePath("/link-in-bio/%E0%A4%A")).toBeNull();
  });
});

describe("isBot", () => {
  it("skips crawlers and previewers", () => {
    expect(isBot("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")).toBe(true);
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isBot("WhatsApp/2.23.20.0")).toBe(true);
    expect(isBot("curl/8.4.0")).toBe(true);
    expect(isBot(null)).toBe(true);
  });
  it("counts people, including in-app browsers", () => {
    expect(
      isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0"),
    ).toBe(false);
    expect(isBot("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 [FBAN/EMA;FBAV/400.0]")).toBe(false);
    expect(isBot("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15")).toBe(false);
  });
});

describe("safeRedirectUrl", () => {
  it("passes http(s) through the URL parser", () => {
    expect(safeRedirectUrl("https://calendly.com/ada")).toBe("https://calendly.com/ada");
    expect(safeRedirectUrl("HTTP://Example.com/a b")).toBe("http://example.com/a%20b");
  });
  it("refuses everything else", () => {
    expect(safeRedirectUrl("javascript:alert(1)")).toBeNull();
    expect(safeRedirectUrl("data:text/html,x")).toBeNull();
    expect(safeRedirectUrl("https://bank.com@evil.example")).toBeNull();
    expect(safeRedirectUrl("//evil.example")).toBeNull();
    expect(safeRedirectUrl(null)).toBeNull();
    expect(safeRedirectUrl(42)).toBeNull();
  });
});

describe("pageUrl and safeJson", () => {
  it("send dead links to the page and escape markup", () => {
    expect(pageUrl("ada-tan")).toBe("https://consultant-content-studio.vercel.app/l/ada-tan");
    expect(safeJson({ a: "<b>&" })).toBe('{"a":"\\u003cb\\u003e\\u0026"}');
  });
});
