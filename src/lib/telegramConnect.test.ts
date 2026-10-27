// What the Telegram card and the schedule steps say from a connect row, the Channels mapping and cache, and the
// file rules the steps check before anything uploads. No network.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
  return m;
});
vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", supabase: {} }));

import {
  HELD_LINE,
  LOGIN_PARAMS,
  WAITING_HELP,
  chatRows,
  connectState,
  loadTelegramChannels,
  loginFrom,
  takeTelegramLogin,
  rowDetail,
  saveTelegramChannels,
  telegramChannels,
  telegramMediaProblem,
  willHold,
  type TelegramRow,
} from "./telegramConnect";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const NOW = Date.parse("2026-11-02T10:00:00+08:00");
const iso = (ms: number) => new Date(ms).toISOString();
const row = (o: Partial<TelegramRow> = {}): TelegramRow => ({
  id: "00000000-0000-4000-8000-0000000000c1",
  profile_id: "me",
  status: "pending",
  chat_id: null,
  chat_type: null,
  title: null,
  username: null,
  is_forum: false,
  topic_id: null,
  topic_name: null,
  refusal: null,
  code_expires_at: iso(NOW + 10 * 60_000),
  tg_user_name: null,
  confirmed_at: null,
  created_at: iso(NOW - 60_000),
  ...o,
});
const group = (o: Partial<TelegramRow> = {}) => row({ status: "connected", chat_id: -1001234567890, chat_type: "supergroup", title: "AdvisorOS", tg_user_name: "@leo_test", ...o });

afterEach(() => store.clear());

describe("the connect's line, from its row", () => {
  it("waits while the code is live, and says what to do in Telegram", () => {
    expect(connectState(row(), NOW)).toEqual({ kind: "waiting" });
    expect(WAITING_HELP).toBe("In Telegram, tap Start, then Confirm, then pick your group or channel.");
  });

  it("says Telegram is linked once the login was verified, while the pick is still to come", () => {
    expect(connectState(row({ confirmed_at: iso(NOW - 1000), tg_user_name: "@leo_test" }), NOW)).toEqual({ kind: "waiting", linked: "Linked to @leo_test. Pick your group or channel in Telegram." });
  });

  it("says why a picked chat wasn't connected, and keeps waiting", () => {
    expect(connectState(row({ refusal: "cant_post", title: "Test group" }), NOW)).toEqual({ kind: "waiting", refused: "Test group isn't connected: the bot needs to be an admin that can post there." });
    expect(connectState(row({ refusal: "not_admin", title: "Test group" }), NOW)).toEqual({ kind: "waiting", refused: "Test group isn't connected: only an admin of it can connect it." });
  });

  it("expires after 15 minutes", () => {
    expect(connectState(row({ code_expires_at: iso(NOW) }), NOW)).toEqual({ kind: "expired", text: "That link expired." });
  });

  it("reads Connected to {name}, with the General line for a forum group until a topic is picked", () => {
    expect(connectState(group(), NOW)).toEqual({ kind: "connected", text: "Connected to AdvisorOS." });
    expect(connectState(group({ is_forum: true }), NOW)).toEqual({ kind: "connected", text: "Connected to AdvisorOS.", forum: "Posts go to General. To post in a topic, open it in Telegram and send /here." });
    expect(connectState(group({ is_forum: true, topic_id: 326, topic_name: "Feature updates" }), NOW)).toEqual({ kind: "connected", text: "Connected to AdvisorOS." });
  });

  it("reads a waiting connect taken off in the app as gone", () => {
    expect(connectState(row({ status: "disconnected" }), NOW)).toEqual({ kind: "gone" });
  });
});

describe("the chats a brand posts to", () => {
  it("lists live, removed and can't-post chats once each, newest first, and leaves out waiting and disconnected rows", () => {
    const rows = [
      group({ id: "a", created_at: iso(NOW) }),
      group({ id: "b", status: "removed", created_at: iso(NOW - 1000) }),
      row({ id: "c" }),
      group({ id: "d", chat_id: -1009876543210, chat_type: "channel", title: "MoneyBees", status: "cant_post" }),
      group({ id: "e", chat_id: -1005, status: "disconnected" }),
    ];
    expect(chatRows(rows).map((r) => r.id)).toEqual(["a", "d"]);
  });

  it("describes each chat: kind, topic, state and who connected it", () => {
    expect(rowDetail(group({ is_forum: true, topic_id: 326, topic_name: "Feature updates" }))).toEqual({ name: "AdvisorOS", kind: "Group", topic: "topic: Feature updates", state: "Working", tone: "ok", by: "Added by @leo_test" });
    expect(rowDetail(group({ chat_type: "channel", title: "MoneyBees", status: "removed", tg_user_name: null }))).toMatchObject({ kind: "Channel", topic: null, state: "Removed in Telegram", tone: "bad", by: null });
    expect(rowDetail(group({ status: "cant_post", topic_id: 9 }))).toMatchObject({ state: "Can't post here", topic: "topic: #9" });
  });
});

describe("Channels", () => {
  it("maps a chat to a channel: its @ name when public, its title as the label otherwise, and its topic", () => {
    expect(telegramChannels([group({ is_forum: true, topic_id: 326, topic_name: "Feature updates" }), group({ id: "d", chat_id: -1009876543210, chat_type: "channel", title: "MoneyBees", username: "moneybees_sg", status: "removed" })])).toEqual([
      { platform: "telegram", username: "", label: "AdvisorOS", topic: "Feature updates", health: "healthy" },
      { platform: "telegram", username: "moneybees_sg", label: "MoneyBees", health: "error" },
    ]);
  });

  it("keeps them per brand on this device, for the Channels block", () => {
    expect(loadTelegramChannels(UID, "me")).toBeNull();
    saveTelegramChannels(UID, "me", [group()]);
    saveTelegramChannels(UID, "p2", []);
    expect(loadTelegramChannels(UID, "me")?.channels).toEqual([{ platform: "telegram", username: "", label: "AdvisorOS", health: "healthy" }]);
    expect(loadTelegramChannels(UID, "p2")?.channels).toEqual([]);
    expect(loadTelegramChannels(null, "me")).toBeNull();
  });
});

describe("before a Telegram post uploads", () => {
  const f = (type: string, mb: number, name = "file") => ({ name, type, size: mb * 1024 * 1024 });
  it("takes up to 10 pictures to 5 MB, or one MP4 video to 20 MB", () => {
    expect(telegramMediaProblem([])).toBeNull();
    expect(telegramMediaProblem([f("image/jpeg", 5), f("image/png", 1)])).toBeNull();
    expect(telegramMediaProblem([f("video/mp4", 20)])).toBeNull();
    expect(telegramMediaProblem([f("video/mp4", 21)])).toBe("Telegram takes videos up to 20 MB from Content Studio. Post a shorter one, or send it in Telegram.");
    expect(telegramMediaProblem([f("image/jpeg", 6, "big.jpg")])).toMatch(/5 MB/);
    expect(telegramMediaProblem([f("video/quicktime", 1, "clip.mov")])).toMatch(/MP4/);
    expect(telegramMediaProblem([f("application/pdf", 1, "deck.pdf")])).toMatch(/MP4/);
    expect(telegramMediaProblem(Array.from({ length: 11 }, () => f("image/jpeg", 1)))).toMatch(/10/);
    expect(telegramMediaProblem([f("image/jpeg", 1), f("video/mp4", 1)])).toMatch(/not both/);
  });

  it("says when a time outside 9am to 9pm is held to 9am", () => {
    expect(willHold("2026-11-02T22:00:00+08:00", NOW)).toBe(true);
    expect(willHold("2026-11-02T14:00:00+08:00", NOW)).toBe(false);
    expect(willHold(null, Date.parse("2026-11-02T23:30:00+08:00"))).toBe(true);
    expect(willHold(null, NOW)).toBe(false);
    expect(HELD_LINE).toBe("Telegram posts go out between 9am and 9pm. This one goes at 9am.");
  });
});

describe("Telegram's login coming back to /accounts", () => {
  const ROW = "00000000-0000-4000-8000-0000000000c1";
  const html = readFileSync("index.html", "utf8");
  const strip = /<script>\s*\/\/ Telegram's login_url return[\s\S]*?<\/script>/.exec(html)?.[0] ?? "";

  it("strips the login fields in the first script of the page, before any other script, style, font or link loads", () => {
    expect(strip).not.toBe("");
    const at = html.indexOf(strip);
    expect(html.indexOf("<script")).toBe(at);
    for (const later of ["<link", "<script src", "<script defer", "<script type=\"module\"", "<style", "<noscript"]) {
      const i = html.indexOf(later);
      if (i >= 0) expect(i, later).toBeGreaterThan(at);
    }
    expect(strip).toContain(JSON.stringify(LOGIN_PARAMS));
  });

  const runStrip = (search: string, storage: "ok" | "blocked" = "ok") => {
    const stored = new Map<string, string>();
    const replaced: unknown[][] = [];
    const win: Record<string, unknown> = {};
    const env = {
      location: { pathname: "/accounts", search, hash: "#telegram" },
      history: { state: { idx: 3 }, replaceState: (...a: unknown[]) => void replaced.push(a) },
      sessionStorage: {
        setItem: (k: string, v: string) => {
          if (storage === "blocked") throw new Error("SecurityError");
          stored.set(k, v);
        },
      },
      window: win,
      URLSearchParams,
      JSON,
    };
    const body = strip.replace(/^<script>/, "").replace(/<\/script>$/, "");
    new Function(...Object.keys(env), body)(...Object.values(env));
    return { stored, replaced, win };
  };

  it("takes Telegram's fields off the address at once and keeps them for the card in this tab", () => {
    const { stored, replaced } = runStrip(`?telegram=${ROW}&id=111000111&first_name=Leo&auth_date=1793500000&hash=${"a".repeat(64)}&asLeo=1`);
    expect(replaced).toEqual([[{ idx: 3 }, "", "/accounts?asLeo=1#telegram"]]);
    expect(JSON.parse(stored.get("cs-telegram-login")!)).toEqual({ telegram: ROW, id: "111000111", first_name: "Leo", auth_date: "1793500000", hash: "a".repeat(64) });
  });

  it("still strips the address when this tab can't store anything", () => {
    const { replaced, win } = runStrip(`?telegram=${ROW}&id=1&hash=x`, "blocked");
    expect(replaced).toEqual([[{ idx: 3 }, "", "/accounts#telegram"]]);
    expect(win.__csTelegramLogin).toEqual({ telegram: ROW, id: "1", hash: "x" });
  });

  it("leaves every other address alone", () => {
    expect(runStrip("?connected=tiktok&username=x").replaced).toEqual([]);
    expect(runStrip("").replaced).toEqual([]);
  });

  it("hands the card the login once, then nothing", () => {
    const session = new Map<string, string>([["cs-telegram-login", JSON.stringify({ telegram: ROW, id: "1", auth_date: "2", hash: "h", extra: "x" })]]);
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => session.get(k) ?? null, removeItem: (k: string) => void session.delete(k) });
    expect(takeTelegramLogin()).toEqual({ chatRow: ROW, auth: { id: "1", auth_date: "2", hash: "h" } });
    expect(takeTelegramLogin()).toBeNull();
    vi.unstubAllGlobals();
  });

  it("is nothing without the row, a well-formed row, or a hash", () => {
    expect(loginFrom({ id: "1", hash: "abc" })).toBeNull();
    expect(loginFrom({ telegram: "x", id: "1", hash: "abc" })).toBeNull();
    expect(loginFrom({ telegram: ROW, id: "1" })).toBeNull();
    expect(LOGIN_PARAMS).toEqual(["telegram", "id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"]);
  });
});
