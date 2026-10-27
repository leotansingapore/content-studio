import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The public /l/<slug> page's function, deployed without JWT and holding the service key. Not an open redirect: a link
// goes only to the http(s) URL the database stored for it, and a click is counted only for a person's GET.
const LINK = "0f8fad5b-d9cb-469f-a165-70867728950e";
const CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";

const h = vi.hoisted(() => ({
  handler: null as null | ((r: Request) => Promise<Response>),
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  answer: { data: null as unknown, error: null as null | { message: string } },
}));
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({
  createClient: () => ({ rpc: async (fn: string, args: Record<string, unknown>) => (h.rpc.push({ fn, args }), h.answer) }),
}));

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (h.handler = fn), env: { get: () => "x" } });
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  h.rpc.length = 0;
  h.answer = { data: null, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const visit = (path: string, ua: string | null = CHROME, method = "GET") =>
  h.handler!(new Request(`http://x/link-in-bio/${path}`, { method, headers: ua ? { "user-agent": ua } : {} }));

describe("a link-in-bio link", () => {
  it("counts a person's click, never a link previewer's, a script's or a HEAD", async () => {
    h.answer = { data: "https://shop.example/a", error: null };
    expect((await visit(`mei-tan/${LINK}`)).headers.get("location")).toBe("https://shop.example/a");
    await visit(`mei-tan/${LINK}`, "WhatsApp/2.23.20.0");
    await visit(`mei-tan/${LINK}`, "curl/8.4.0");
    await visit(`mei-tan/${LINK}`, null);
    await visit(`mei-tan/${LINK}`, CHROME, "HEAD");
    expect(h.rpc.map((c) => c.args.p_count)).toEqual([true, false, false, false, false]);
    expect(h.rpc[0]).toEqual({ fn: "cs_bio_click", args: { p_slug: "mei-tan", p_link_id: LINK, p_count: true } });
  });

  it("sends a stored target that isn't a web address to the page instead", async () => {
    for (const data of ["javascript:alert(1)", "https://user:pw@shop.example/", null]) {
      h.answer = { data, error: null };
      const r = await visit(`mei-tan/${LINK}`);
      expect(r.status).toBe(302);
      expect(r.headers.get("location")).toBe("https://app.postmosis.com/l/mei-tan");
    }
  });

  it("answers a database failure with the page for a link and a plain error for the page, never the database's words", async () => {
    h.answer = { data: null, error: { message: "permission denied for function cs_bio_click" } };
    expect((await visit(`mei-tan/${LINK}`)).headers.get("location")).toBe("https://app.postmosis.com/l/mei-tan");
    const r = await visit("mei-tan");
    expect(r.status).toBe(500);
    expect(await r.text()).toBe('{"error":"server"}');
  });

  it("asks the database nothing for an address that isn't a page or a link", async () => {
    for (const bad of ["", "a", "mei-tan/not-a-uuid", `mei-tan/${LINK}/more`]) expect((await visit(bad)).status).toBe(404);
    expect(h.rpc).toEqual([]);
  });
});
