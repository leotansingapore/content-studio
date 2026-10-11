import { describe, expect, it } from "vitest";
import { clientIp, parsePath, visitorKey } from "./logic";

const REPORT = "abcdefghij2345678xyz";

describe("parsePath", () => {
  it("reads a link and a report", () => {
    expect(parsePath("/tracked-link/ada-guide")).toEqual({ kind: "link", slug: "ada-guide" });
    expect(parsePath("/functions/v1/tracked-link/Ada-Guide")).toEqual({ kind: "link", slug: "ada-guide" });
    expect(parsePath(`/tracked-link/report/${REPORT.toUpperCase()}`)).toEqual({ kind: "report", slug: REPORT });
  });
  it("refuses malformed slugs, report slugs and extra segments", () => {
    expect(parsePath("/tracked-link/")).toBeNull();
    expect(parsePath("/tracked-link/ab")).toBeNull();
    expect(parsePath("/tracked-link/ada_guide")).toBeNull();
    expect(parsePath("/tracked-link/report/short")).toBeNull();
    expect(parsePath(`/tracked-link/report/${REPORT}-`)).toBeNull();
    expect(parsePath(`/tracked-link/ada-guide/${REPORT}`)).toBeNull();
    expect(parsePath(`/tracked-link/report/${REPORT}/x`)).toBeNull();
    expect(parsePath("/tracked-link/%E0%A4%A")).toBeNull();
  });
});

describe("clientIp", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  // Header sets as measured through the live /t/ rewrite and on direct calls (2026-10-11).
  const vercel = { "x-vercel-id": "sin1::abc", "x-forwarded-for": "76.76.21.1, 172.70.1.1, 10.0.0.1", "cf-connecting-ip": "76.76.21.1" };
  it("takes the visitor Vercel names through the /t/ rewrite, never the Vercel server", () => {
    expect(clientIp(h({ ...vercel, "x-vercel-proxied-for": "203.0.113.7", "x-vercel-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
    // x-vercel-forwarded-for can carry what the visitor sent; x-vercel-proxied-for wins.
    expect(clientIp(h({ ...vercel, "x-vercel-proxied-for": "203.0.113.7", "x-vercel-forwarded-for": "198.51.100.9" }))).toBe("203.0.113.7");
    expect(clientIp(h({ ...vercel, "x-vercel-forwarded-for": "203.0.113.8" }))).toBe("203.0.113.8");
    expect(clientIp(h(vercel))).toBeNull();
  });
  it("takes the gateway's first forwarded address on a direct call", () => {
    expect(clientIp(h({ "x-forwarded-for": "198.51.100.4, 172.70.1.1, 10.0.0.1", "cf-connecting-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIp(h({ "x-forwarded-for": "2001:DB8::1, 10.0.0.1" }))).toBe("2001:db8::1");
    expect(clientIp(h({ "cf-connecting-ip": "198.51.100.5" }))).toBe("198.51.100.5");
  });
  it("gives none for junk", () => {
    expect(clientIp(h({ "x-forwarded-for": "not an ip", "x-vercel-proxied-for": "999.1.1.1" }))).toBeNull();
    expect(clientIp(h({}))).toBeNull();
  });
});

describe("visitorKey", () => {
  it("is the SHA-256 hex of v:<ip>|<user agent>", async () => {
    // printf 'v:203.0.113.7|Mozilla/5.0' | shasum -a 256
    expect(await visitorKey("203.0.113.7", "Mozilla/5.0")).toBe("d76f29b05a671be602502bb4f74bb84681863ca8fd20148ea9c77a01fcc2b0b3");
  });
  it("differs by IP and by user agent, and is null without an IP", async () => {
    const a = await visitorKey("203.0.113.7", "Mozilla/5.0");
    expect(await visitorKey("203.0.113.8", "Mozilla/5.0")).not.toBe(a);
    expect(await visitorKey("203.0.113.7", "Safari")).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await visitorKey(null, "Mozilla/5.0")).toBeNull();
  });
});
