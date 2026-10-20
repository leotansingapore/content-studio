import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The public /t/<slug> handler with the database faked: where a tap goes and what it counts.
const db = vi.hoisted(() => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  // slug -> the address saved for it; report slug -> its report
  const links: Record<string, string> = {};
  const reports: Record<string, unknown> = {};
  let fail = false;
  const admin = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fail) return { data: null, error: { code: "57014", message: "canceling statement for slug ada-guide" } };
      return fn === "cs_tracked_link_click"
        ? { data: links[String(args.p_slug)] ?? null, error: null }
        : { data: reports[String(args.p_report_slug)] ?? null, error: null };
    },
  };
  return { admin, calls, links, reports, failNext: (v: boolean) => (fail = v), handler: null as null | ((r: Request) => Promise<Response>) };
});
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => db.admin }));

const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const REPORT = "abcdefghij2345678xyz";

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: () => "x" } });
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  db.calls.length = 0;
  db.failNext(false);
  for (const k of Object.keys(db.links)) delete db.links[k];
  Object.assign(db.links, { "ada-guide": "https://acme.sg/guide?utm_source=ig", "bad-link": "javascript:alert(document.cookie)", "data-link": "data:text/html,<script>x</script>" });
});

const tap = (path: string, init: { method?: string; ua?: string | null } = {}) =>
  db.handler!(new Request(`http://x/tracked-link/${path}`, {
    method: init.method ?? "GET",
    headers: { ...(init.ua === null ? {} : { "user-agent": init.ua ?? PHONE }), "x-forwarded-for": "198.51.100.4, 10.0.0.1" },
  }));

describe("a tracked link", () => {
  it("sends a tap on to the saved address and counts the person by a key that never carries their address", async () => {
    const r = await tap("Ada-Guide");
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("https://acme.sg/guide?utm_source=ig");
    expect(db.calls).toHaveLength(1);
    const { fn, args } = db.calls[0];
    expect(fn).toBe("cs_tracked_link_click");
    expect(args).toMatchObject({ p_slug: "ada-guide", p_count: true });
    expect(args.p_visitor).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(args)).not.toContain("198.51.100.4");
  });

  it("never counts a link preview, a request with no browser, or a HEAD, but still sends them on", async () => {
    for (const init of [{ ua: "facebookexternalhit/1.1" }, { ua: null }, { method: "HEAD" }]) {
      db.calls.length = 0;
      const r = await tap("ada-guide", init);
      expect(r.status, JSON.stringify(init)).toBe(302);
      expect(db.calls[0].args, JSON.stringify(init)).toMatchObject({ p_count: false, p_visitor: null });
    }
  });

  it("never sends anyone to a saved address that isn't a web page", async () => {
    for (const slug of ["bad-link", "data-link", "no-such-link"]) {
      const r = await tap(slug);
      expect(r.status, slug).toBe(404);
      expect(r.headers.get("location"), slug).toBeNull();
      expect(await r.text()).toBe("This link isn't available. Check the address, or ask the person who shared it.\n");
    }
  });

  it("answers a malformed address without asking the database", async () => {
    for (const path of ["a", "ada_guide", "ada-guide/extra", "report/short"]) expect((await tap(path)).status, path).toBe(404);
    expect(db.calls).toEqual([]);
  });

  it("says try again when the database fails, without showing its message", async () => {
    db.failNext(true);
    const r = await tap("ada-guide");
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("ada-guide");
  });
});

describe("a campaign's public report", () => {
  it("is read by its report address, and an unknown one is a 404", async () => {
    db.reports[REPORT] = { name: "Launch", taps: 3 };
    const r = await tap(`report/${REPORT}`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ name: "Launch", taps: 3 });
    const gone = await tap(`report/${"z".repeat(20)}`);
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual({ error: "not_found" });
  });
});
