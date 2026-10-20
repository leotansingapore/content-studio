import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCapped } from "./safeFetch";

// Node builds its fetch classes the first time one is used, which takes seconds on a busy
// machine: build them while this file loads, not inside a test's 5 s.
void new Response("");

// what DNS answers for each name; a name missing here does not resolve
const DNS: Record<string, { A?: string[]; AAAA?: string[] }> = {
  "acme.sg": { A: ["151.101.1.69"] },
  "cdn.acme.sg": { A: ["151.101.1.70"], AAAA: ["2606:4700::6810:84e5"] },
  // a public A record beside an AAAA record that points into a network
  "sneaky.sg": { A: ["151.101.1.71"], AAAA: ["::ffff:10.0.0.7"] },
  "inside.sg": { A: ["169.254.169.254"] },
};
const fetched: string[] = [];
let answer: (url: string) => Response;

const resolveDns = async (host: string, type: "A" | "AAAA") => {
  const r = DNS[host]?.[type];
  if (!r) throw new Error("NXDOMAIN");
  return r;
};
beforeEach(() => {
  fetched.length = 0;
  vi.stubGlobal("Deno", { resolveDns });
  vi.stubGlobal("fetch", async (u: URL) => (fetched.push(String(u)), answer(String(u))));
});
afterEach(() => vi.unstubAllGlobals());

const moved = (to: string) => new Response(null, { status: 302, headers: { location: to } });
const page = (body: BodyInit) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
const read = (url: string, max = 1000) => fetchCapped(new URL(url), max, "text/html", AbortSignal.timeout(5_000));

describe("reading a site someone typed", () => {
  it("follows a redirect on the same public site and says where it ended up", async () => {
    answer = (u) => (u === "https://acme.sg/" ? moved("/home") : page("<title>Acme</title>"));
    const r = await read("https://acme.sg/");
    expect(r.url.href).toBe("https://acme.sg/home");
    expect(r.type).toBe("text/html");
    expect(new TextDecoder().decode(r.bytes)).toBe("<title>Acme</title>");
  });

  it("refuses a site when any one address it resolves to is inside a network, without opening it", async () => {
    answer = () => page("secret");
    await expect(read("https://sneaky.sg/")).rejects.toThrow("doesn't resolve to a public address");
    expect(fetched).toEqual([]);
  });

  it("refuses a name DNS can't answer for, and refuses everything when addresses can't be checked", async () => {
    answer = () => page("hi");
    await expect(read("https://nowhere.sg/")).rejects.toThrow("doesn't resolve to a public address");
    vi.stubGlobal("Deno", {});
    await expect(read("https://acme.sg/")).rejects.toThrow("doesn't resolve to a public address");
    expect(fetched).toEqual([]);
  });

  it("checks where a redirect points before following it", async () => {
    answer = (u) => (u === "https://acme.sg/" ? moved("https://inside.sg/latest/meta-data") : page("secret"));
    await expect(read("https://acme.sg/")).rejects.toThrow("inside.sg doesn't resolve to a public address");
    expect(fetched).toEqual(["https://acme.sg/"]);
  });

  it("never follows a redirect to a bare IP, a port or a page that isn't on the web", async () => {
    for (const to of ["http://169.254.169.254/latest/meta-data", "https://acme.sg:8080/admin", "file:///etc/passwd", "http://localhost/"]) {
      fetched.length = 0;
      answer = (u) => (u === "https://acme.sg/" ? moved(to) : page("secret"));
      await expect(read("https://acme.sg/"), to).rejects.toThrow("redirects somewhere we can't read");
      expect(fetched, to).toEqual(["https://acme.sg/"]);
    }
  });

  it("gives up after three redirects", async () => {
    answer = (u) => moved(u.endsWith("/a") ? "https://cdn.acme.sg/b" : "https://cdn.acme.sg/a");
    await expect(read("https://acme.sg/")).rejects.toThrow("redirects too many times");
    expect(fetched).toHaveLength(4);
  });

  it("hands back a file over the cap cut at the cap, so a caller can tell it was too big", async () => {
    // three 400-byte pieces against a 1000-byte cap
    const chunks = () => new ReadableStream<Uint8Array>({
      start(c) {
        for (const n of [1, 2, 3]) c.enqueue(new Uint8Array(400).fill(n));
        c.close();
      },
    });
    answer = () => page(chunks());
    const big = await read("https://acme.sg/", 1000);
    expect(big.bytes.byteLength).toBe(1000);
    expect([big.bytes[0], big.bytes[400], big.bytes[999]]).toEqual([1, 2, 3]);
    answer = () => page(chunks());
    expect((await read("https://acme.sg/", 5000)).bytes.byteLength).toBe(1200);
  });
});
