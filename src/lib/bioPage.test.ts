import { describe, expect, it } from "vitest";
import {
  clickHref,
  dmFields,
  dmLinks,
  fbPageName,
  igUsername,
  waDigits,
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

describe("DM links", () => {
  it("reads an Instagram username from a handle or a link", () => {
    expect(igUsername("@Ada.Tan_sg")).toBe("ada.tan_sg");
    expect(igUsername("https://www.instagram.com/ada.tan/?hl=en")).toBe("ada.tan");
    expect(igUsername("ig.me/m/ada")).toBe("ada");
    expect(igUsername(" ada ")).toBe("ada");
    for (const bad of ["", "@", "ada..tan", ".ada", "ada.", "ada-tan", "a".repeat(31), "ada tan!"]) expect(igUsername(bad)).toBeNull();
  });

  it("reads a Facebook page username or id", () => {
    expect(fbPageName("adatan.advisory")).toBe("adatan.advisory");
    expect(fbPageName("https://m.facebook.com/AdaTanAdvisory/")).toBe("AdaTanAdvisory");
    expect(fbPageName("m.me/adatan.sg")).toBe("adatan.sg");
    expect(fbPageName("facebook.com/profile.php?id=100064123456789")).toBe("100064123456789");
    for (const bad of ["", "ada", "ada tan", "ada_tan", "facebook.com/"]) expect(fbPageName(bad)).toBeNull();
  });

  it("takes a Singapore number with or without the +65 and spaces, and others with + and a code", () => {
    for (const ok of ["+65 9123 4567", "65 9123 4567", "6591234567", "9123 4567", "+65-8123-4567", "(65) 6123 4567"]) expect(waDigits(ok)).toMatch(/^65[3689]\d{7}$/);
    expect(waDigits("+65 9123 4567")).toBe("6591234567");
    expect(waDigits("+60 12-345 6789")).toBe("60123456789");
    for (const bad of ["", "1234 5678", "+65 1234 5678", "+65 9123 456", "91234567a", "012 345 6789", "+0 1234 5678", "60123456789"]) expect(waDigits(bad)).toBeNull();
  });

  it("builds the links that are filled in and valid, with the WhatsApp message encoded", () => {
    expect(dmLinks({ instagram: "@ada", facebook: "ada", whatsapp: "9123 4567", whatsappText: " Hi Ada, saw your post & want a chat " })).toEqual([
      { id: "instagram", label: "DM me on Instagram", url: "https://ig.me/m/ada" },
      { id: "whatsapp", label: "WhatsApp me", url: "https://wa.me/6591234567?text=Hi%20Ada%2C%20saw%20your%20post%20%26%20want%20a%20chat" },
    ]);
    expect(dmLinks({ instagram: "", facebook: "adatan.sg", whatsapp: "+6591234567", whatsappText: "" }).map((l) => l.url)).toEqual(["https://m.me/adatan.sg", "https://wa.me/6591234567"]);
    for (const l of dmLinks({ instagram: "ada", facebook: "adatan.sg", whatsapp: "91234567", whatsappText: "Hi! Is 3pm ok?" })) expect(linkProblem(l)).toBeNull();
  });

  it("starts a field never set in the brand kit from the account on Analytics, and keeps a cleared one empty", () => {
    const accounts = { instagram: { handle: "instagram.com/ada.tan" }, facebook: { handle: "not a page" } };
    expect(dmFields(null, accounts)).toEqual({ instagram: "ada.tan", facebook: "", whatsapp: "", whatsappText: "" });
    expect(dmFields({ instagram: "" }, accounts).instagram).toBe("");
    expect(dmFields({ instagram: "other", whatsapp: "91234567" }, {})).toMatchObject({ instagram: "other", whatsapp: "91234567" });
  });
});
