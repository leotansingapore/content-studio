import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[] | null>,
  maybe: {} as Record<string, unknown>,
  calls: [] as Record<string, unknown>[],
  fail: null as string | null,
}));

vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: {
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: async () => ({ data: db.tables[table], error: null }),
        maybeSingle: async () => ({ data: db.maybe[table] ?? null, error: null }),
        then: (ok: (r: unknown) => unknown, bad: (e: unknown) => unknown) =>
          Promise.resolve({ data: db.tables[table], error: db.tables[table] === null ? { message: "boom" } : null }).then(ok, bad),
      };
      return q;
    },
  },
}));
vi.mock("@/lib/edgeFn", async (actual) => ({
  ...(await actual<typeof import("@/lib/edgeFn")>()),
  callFn: async (name: string, body: Record<string, unknown>) => {
    db.calls.push({ name, ...body });
    if (db.fail === body.action) throw new Error("Couldn't reach Telegram. Try again in a minute.");
    return {};
  },
}));

const { pauseBrandCampaigns, stopBrandTelegram } = await import("./brandRemoval");

const row = (id: string, status: string) => ({ id, status });

beforeEach(() => {
  db.tables = {};
  db.maybe = {};
  db.calls = [];
  db.fail = null;
});

describe("removing a brand stops what it has running on the server", () => {
  it("disconnects each of the brand's Telegram chats, which cancels their waiting posts, then removes its own bot", async () => {
    db.tables.cs_telegram_chats = [row("c1", "connected"), row("c2", "pending"), row("c3", "cant_post"), row("c4", "disconnected"), row("c5", "removed")];
    db.maybe.cs_telegram_bots = { id: "b1", bot_id: 7, username: "acme_bot", display_name: "Acme", status: "active" };
    await stopBrandTelegram("p2");
    expect(db.calls).toEqual([
      { name: "telegram", action: "disconnect", profileId: "p2", chatRow: "c1" },
      { name: "telegram", action: "disconnect", profileId: "p2", chatRow: "c3" },
      { name: "telegram", action: "disconnect", profileId: "p2", chatRow: "c5" },
      { name: "telegram", action: "bot-remove", profileId: "p2" },
    ]);
  });

  it("calls nothing for a brand with no Telegram, and a failed disconnect throws so the brand stays", async () => {
    db.tables.cs_telegram_chats = [];
    await stopBrandTelegram("p2");
    expect(db.calls).toEqual([]);
    db.tables.cs_telegram_chats = [row("c1", "connected")];
    db.fail = "disconnect";
    await expect(stopBrandTelegram("p2")).rejects.toThrow("Couldn't reach Telegram");
  });

  it("pauses only the brand's live campaigns, and a failed read throws so the brand stays", async () => {
    db.tables.cs_slide_campaigns = [row("k1", "live"), row("k2", "paused"), row("k3", "live"), row("k4", "draft")];
    await pauseBrandCampaigns("p2");
    expect(db.calls).toEqual([
      { name: "slide-campaigns", action: "pause", id: "k1" },
      { name: "slide-campaigns", action: "pause", id: "k3" },
    ]);
    db.tables.cs_slide_campaigns = null;
    await expect(pauseBrandCampaigns("p2")).rejects.toThrow("Couldn't load the brand's campaigns");
  });
});
