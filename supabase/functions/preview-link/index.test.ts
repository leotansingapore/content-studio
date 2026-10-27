import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The public /review/<token> page's function, deployed without JWT and holding the service key: it may only call the
// two preview-link SQL functions, and only with a token of the right shape. What those functions enforce is SQL's.
const TOKEN = "pUqAjjhJR3eWI149_6bMwFB5w5tzxU_CnvmyJyicjwM";

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

const view = (token = TOKEN, origin?: string) => h.handler!(new Request(`http://x/preview-link/${token}`, { headers: origin ? { origin } : {} }));
const comment = (body: string) => h.handler!(new Request(`http://x/preview-link/${TOKEN}`, { method: "POST", body }));

describe("a compliance preview link", () => {
  it("answers not found to a token that isn't one, without asking the database", async () => {
    for (const bad of ["short", `${TOKEN}x`, "%E0%A4%A"]) {
      const r = await view(bad);
      expect(r.status).toBe(404);
      expect((await r.json()).error).toBe("not_found");
    }
    expect(h.rpc).toEqual([]);
  });

  it("looks sent to a bot that filled the hidden field, and writes nothing", async () => {
    const r = await comment(JSON.stringify({ name: "Bot", body: "Buy now", website: "https://spam.example" }));
    expect(await r.json()).toEqual({ ok: true, comment: null });
    expect(h.rpc).toEqual([]);
  });

  it("refuses a comment over 8 KB sent without a length, before it is written", async () => {
    const r = await comment(JSON.stringify({ name: "Mei", body: "x".repeat(9 * 1024) }));
    expect(r.status).toBe(413);
    expect(h.rpc).toEqual([]);
  });

  it("says try again, never the database's own words, when a read fails", async () => {
    h.answer = { data: null, error: { message: "permission denied for function cs_preview_link_view" } };
    const r = await view();
    expect(r.status).toBe(500);
    const text = await r.text();
    expect(JSON.parse(text)).toEqual({ error: "server", message: "Couldn't load this right now. Try again in a minute." });
    expect(text).not.toContain("permission denied");
  });

  it("lets only the app's own pages read it from a browser", async () => {
    h.answer = { data: { post: "Hi" }, error: null };
    expect((await view(TOKEN, "https://evil.example")).headers.get("access-control-allow-origin")).toBeNull();
    expect((await view(TOKEN, "https://app.postmosis.com")).headers.get("access-control-allow-origin")).toBe("https://app.postmosis.com");
  });
});
