import { describe, expect, it } from "vitest";
import { consumeUsage, DAILY_LIMITS, usageRefusal, type RpcClient } from "./usageCaps";

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
