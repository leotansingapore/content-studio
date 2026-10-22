import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { claimOnce, consumeUsage, DAILY_LIMITS, refundUsage, usageRefusal, type RpcClient, type UsageClient } from "./usageCaps";

const client = (result: { data: unknown; error: unknown } | Error): RpcClient & { calls: unknown[] } => {
  const calls: unknown[] = [];
  return {
    calls,
    rpc(fn, args) {
      calls.push({ fn, args });
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    },
  };
};

describe("consumeUsage", () => {
  it("allows a use under the limit and passes the feature's limit", async () => {
    const admin = client({ data: 3, error: null });
    expect(await consumeUsage(admin, "u1", "reel-clone")).toEqual({
      allowed: true,
      used: 3,
      limit: DAILY_LIMITS["reel-clone"],
    });
    expect(admin.calls).toEqual([
      { fn: "cs_consume_ai_usage", args: { p_user: "u1", p_feature: "reel-clone", p_limit: 20 } },
    ]);
  });

  it("refuses once the database says the limit is reached", async () => {
    const result = await consumeUsage(client({ data: null, error: null }), "u1", "idea-dump");
    expect(result).toEqual({ allowed: false, limit: 30, reason: "limit" });
    expect(usageRefusal(result as Extract<typeof result, { allowed: false }>).status).toBe(429);
  });

  it("fails closed when the counter can't be read", async () => {
    const errored = await consumeUsage(client({ data: null, error: { message: "down" } }), "u1", "carousel");
    const thrown = await consumeUsage(client(new Error("network")), "u1", "carousel");
    expect(errored).toMatchObject({ allowed: false, reason: "unavailable" });
    expect(thrown).toMatchObject({ allowed: false, reason: "unavailable" });
    expect(usageRefusal(errored as Extract<typeof errored, { allowed: false }>).status).toBe(503);
  });
});

describe("giving a use back", () => {
  // cs_ai_usage with one row at `count`; `update` answers each conditional update
  const table = (count: number, update: () => { data: unknown; error: unknown } | Error) => {
    const seen = { reads: 0, updates: 0 };
    const admin: UsageClient = {
      rpc: async () => ({ data: null, error: null }),
      from: () => ({
        select: () => ({ match: async () => (seen.reads++, { data: [{ count }], error: null }) }),
        update: () => ({ match: () => ({ select: async () => { seen.updates++; const r = update(); if (r instanceof Error) throw r; return r; } }) }),
      }),
    };
    return { admin, seen };
  };

  it("gives up after three lost races and leaves the use spent", async () => {
    const t = table(2, () => ({ data: [], error: null }));
    expect(await refundUsage(t.admin, "u1", "ai-video", "2026-10-11")).toBe(false);
    expect(t.seen).toEqual({ reads: 3, updates: 3 });
  });

  it("never counts an update that errored or threw as given back", async () => {
    const errored = table(2, () => ({ data: [{ count: 1 }], error: { message: "denied" } }));
    expect(await refundUsage(errored.admin, "u1", "ai-video", "2026-10-11")).toBe(false);
    const thrown = table(2, () => new Error("network"));
    expect(await refundUsage(thrown.admin, "u1", "ai-video", "2026-10-11")).toBe(false);
    expect(thrown.seen).toEqual({ reads: 1, updates: 1 });
  });

  it("claims a refund once a day, and refuses when the counter errors or can't be reached", async () => {
    expect(await claimOnce(client({ data: 1, error: null }), "u1", "refund:abc")).toBe(true);
    expect(await claimOnce(client({ data: null, error: null }), "u1", "refund:abc")).toBe(false);
    expect(await claimOnce(client({ data: 1, error: { message: "down" } }), "u1", "refund:abc")).toBe(false);
    expect(await claimOnce(client(new Error("network")), "u1", "refund:abc")).toBe(false);
    const admin = client({ data: 1, error: null });
    await claimOnce(admin, "u1", "refund:abc");
    expect(admin.calls).toEqual([{ fn: "cs_consume_ai_usage", args: { p_user: "u1", p_feature: "refund:abc", p_limit: 1 } }]);
  });
});

describe("the north-star phase-1 caps", () => {
  // Declared up front so no later phase-1 task edits this file; the functions that consume them ship later.
  it("holds the limits the build brief set", () => {
    expect(DAILY_LIMITS).toMatchObject({ "remix-make": 30, "remix-teardown": 40, "remix-fit": 100, "remix-link": 20, "remix-image": 10 });
  });
});

describe("the north-star phase-2 caps", () => {
  // Declared up front so no later phase-2 task edits this file (phase2-build-brief.md, usage caps and prices).
  it("holds the 18 limits the build brief set", () => {
    const phase2 = {
      "competitor-read": 20,
      "competitor-suggest": 5,
      "competitor-ads": 15,
      "competitor-ads-global": 60,
      "competitor-posts": 30,
      "competitor-posts-global": 60,
      "space-ads": 2,
      "space-ads-global": 10,
      "ad-labels": 10,
      "niche-match": 5,
      "viral-search": 10,
      "viral-search-global": 40,
      "post-tags": 60,
      "brief-pick": 10,
      "creator-fit": 5,
      "search-topics": 2,
      "search-topics-global": 10,
      "remix-patterns": 10,
    };
    expect(Object.keys(phase2)).toHaveLength(18);
    expect(DAILY_LIMITS).toMatchObject(phase2);
  });
});

describe("north-star phase-3 caps", () => {
  // Declared up front so no later phase-3 task edits this file (phase3-build-brief.md, usage caps and prices).
  it("holds the 5 limits the build brief set", () => {
    const phase3 = { "own-words": 20, "page-read": 10, "thread-copy": 30, "edit-ask": 60, "caption-keywords": 30 };
    expect(Object.keys(phase3)).toHaveLength(5);
    expect(DAILY_LIMITS).toMatchObject(phase3);
  });
});

describe("north-star phase-4 caps", () => {
  // Declared up front so no later phase-4 task edits this file (phase4-build-brief.md, usage caps and prices).
  it("holds the 7 limits the build brief set", () => {
    const phase4 = {
      "likeness-check": 5,
      "ai-presenter": 12,
      "ai-presenter-global": 10,
      "brand-products": 10,
      "brand-image": 100,
      "media-sort": 200,
      "post-translate": 30,
    };
    expect(Object.keys(phase4)).toHaveLength(7);
    expect(DAILY_LIMITS).toMatchObject(phase4);
    // a deep read on /brand counts once against today's brand-dna cap, which stays at 10
    expect(DAILY_LIMITS["brand-dna"]).toBe(10);
  });
});

describe("north-star phase-5 caps", () => {
  // Declared up front so no later phase-5 task edits this file (phase5-build-brief.md, usage caps and prices).
  it("holds the 5 limits the build brief set", () => {
    const phase5 = { "audience-suggest": 5, "campaign-angles": 10, "campaign-draft": 20, "campaign-swap": 40, "ideas-daily": 15 };
    expect(Object.keys(phase5)).toHaveLength(5);
    expect(DAILY_LIMITS).toMatchObject(phase5);
  });
});

describe("the edge functions that spend", () => {
  // A name missing from DAILY_LIMITS reaches the database as p_limit null, which refuses
  // every call: the feature would say "You've used all undefined for today" from its first use.
  it("count every paid call against a cap that exists", () => {
    const root = new URL("../", import.meta.url);
    const used: string[] = [];
    for (const dir of readdirSync(root, { withFileTypes: true })) {
      if (!dir.isDirectory() || dir.name.startsWith("_")) continue;
      let source: string;
      try {
        source = readFileSync(new URL(`${dir.name}/index.ts`, root), "utf8");
      } catch {
        continue;
      }
      for (const call of source.matchAll(/consumeUsage\(\s*admin,\s*[^,]+,\s*([^)]+)\)/g)) {
        let arg = call[1].trim();
        if (/^\w+$/.test(arg)) arg = source.match(new RegExp(`const ${arg} = ([^;]+);`))?.[1] ?? "";
        const names = [...arg.replace(/[!=]==\s*["'][^"']*["']/g, "").matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
        expect(names, `${dir.name}: ${call[0]}`).not.toEqual([]);
        for (const name of names) {
          expect(Object.keys(DAILY_LIMITS), `${dir.name} spends on "${name}"`).toContain(name);
          used.push(name);
        }
      }
    }
    expect(used).toContain("engage-connect");
    expect(used).toContain("ai-broll-global");
    expect(used.length).toBeGreaterThanOrEqual(30);
  });
});
