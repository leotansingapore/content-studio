// The website typed before checkout: one rule on the server and in the app's website box, and what /welcome reads.
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth } }));

import { webAddress } from "./onboardingFlow";
import { checkoutSite } from "./subscription";
import { siteOf } from "../../supabase/functions/_shared/subscription.ts";

// the website box's own cases (onboardingFlow.test.ts), and more
const OK = ["postmosis.com", "www.acme.sg", "https://acme.com.sg/about", "http://acme.io", "  acme.sg  ", "xn--80ak6aa92e.com", "my-brand.co.uk", "ACME.SG/Menu", "acme.sg/a?b=c#d", "//acme.sg"];
const BAD = ["", "abc", "postmosis", "http://x", "a.b", "localhost:3000", "https://example", "not a url.com", "ftp://a.com", "acme.sg:8080", "user:pw@acme.sg", "-acme.sg", "acme..sg", "acme.123", "10.0.0.1", "http://127.0.0.1", "javascript:alert(1)", "acme.sg\nmetadata[app]=hub", "acme.sg&metadata[app]=hub", "[::1]"];

describe("the website a visitor types before checkout", () => {
  it("is accepted and refused exactly as the app's website box does it", () => {
    for (const s of [...OK, ...BAD]) expect(siteOf(s) !== null, JSON.stringify(s)).toBe(webAddress(s) !== null);
    for (const s of OK) expect(siteOf(s), s).not.toBeNull();
    for (const s of BAD) expect(siteOf(s), JSON.stringify(s)).toBeNull();
  });

  it("is kept as host plus path, without scheme, query, fragment or trailing slash", () => {
    expect(siteOf("https://WWW.Acme.sg/About/?utm=1#top")).toBe("www.acme.sg/About");
    expect(siteOf("  acme.sg/ ")).toBe("acme.sg");
    expect(siteOf("http://acme.io")).toBe("acme.io");
    expect(siteOf("acme.sg/a b")).toBeNull();
    for (const s of OK) expect(siteOf(s)!, s).toMatch(/^[a-z0-9.-]+(\/[^\s?#]*)?$/);
  });

  it("is dropped over 200 characters and when it is not a string", () => {
    expect(siteOf(`acme.sg/${"a".repeat(192)}`)).toHaveLength(200);
    expect(siteOf(`acme.sg/${"a".repeat(193)}`)).toBeNull();
    expect(siteOf(`${" ".repeat(300)}acme.sg`)).toBe("acme.sg");
    // the limit is on what was typed, whatever would have been kept of it
    expect(siteOf(`acme.sg?${"a".repeat(250)}`)).toBeNull();
    // the limit is on what is stored, too: a short input whose path grows when encoded
    expect(siteOf(`acme.sg/${"\u00e9".repeat(60)}`)).toBeNull();
    for (const v of [null, undefined, 7, true, ["acme.sg"], { site: "acme.sg" }, { toString: () => "acme.sg" }]) expect(siteOf(v), JSON.stringify(v)).toBeNull();
  });
});

describe("checkoutSite", () => {
  const signedIn = (user_metadata: unknown) => auth.getSession.mockResolvedValue({ data: { session: { user: { user_metadata } } } });
  beforeEach(() => auth.getSession.mockReset());

  it("gives the website saved on the account at checkout", async () => {
    signedIn({ postmosis_site: "acme.sg/about" });
    expect(await checkoutSite()).toBe("acme.sg/about");
  });

  it("gives null when there is none, when signed out, and for anything that is not a web address", async () => {
    for (const meta of [{}, undefined, null, { postmosis_site: "" }, { postmosis_site: "javascript:alert(1)" }, { postmosis_site: { a: 1 } }, { postmosis_site: "<img src=x onerror=alert(1)>" }]) {
      signedIn(meta);
      expect(await checkoutSite(), JSON.stringify(meta)).toBeNull();
    }
    auth.getSession.mockResolvedValue({ data: { session: null } });
    expect(await checkoutSite()).toBeNull();
  });
});
