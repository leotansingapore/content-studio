import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));
// the channels cache is kept under the user in supabase-js's stored session
vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", supabase: {} }));
const signIn = (id: string | null) =>
  id ? localStorage.setItem("sb-abc-auth-token", JSON.stringify({ access_token: "t", user: { id } })) : localStorage.removeItem("sb-abc-auth-token");

const { EdgeError } = await import("@/lib/edgeFn");
const {
  capLine,
  checkSocialConnect,
  clearConnectReturn,
  countLine,
  defaultAccount,
  disconnectBrand,
  forgetSocialConnect,
  groupAccounts,
  healthLabel,
  loadChannels,
  loadSocialDefaults,
  onChannelsChanged,
  readConnectReturn,
  readRedirect,
  removedLine,
  saveConnectReturn,
  saveSocialDefault,
  socialConnectShown,
  socialStatus,
} = await import("./socialConnect");
type AccountView = import("./socialConnect").AccountView;

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemStorage());
  vi.stubGlobal("sessionStorage", new MemStorage());
  callFn.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const notEnabled = () => new EdgeError("Not enabled.", 404);

describe("whether the page shows", () => {
  it("is hidden until the server says enabled, then asks again only after 6 hours", async () => {
    expect(socialConnectShown()).toBe(false);
    callFn.mockResolvedValue({ enabled: true });
    expect(await checkSocialConnect()).toBe(true);
    expect(callFn).toHaveBeenCalledWith("social", { action: "status" });
    expect(socialConnectShown()).toBe(true);
    expect(await checkSocialConnect()).toBe(true);
    expect(callFn).toHaveBeenCalledTimes(1);
    vi.useFakeTimers({ now: Date.now() + 6 * 3600_000 + 1 });
    // off is a plain 200, so the browser logs no failed request
    callFn.mockResolvedValue({ enabled: false });
    expect(await checkSocialConnect()).toBe(false);
    expect(socialConnectShown()).toBe(false);
  });

  it("reads anything but enabled:true as off, a 404 included", async () => {
    for (const answer of [{}, null, { enabled: "true" }]) {
      localStorage.removeItem("cs-social-connect");
      callFn.mockResolvedValue(answer);
      expect(await checkSocialConnect(), JSON.stringify(answer)).toBe(false);
    }
    localStorage.setItem("cs-social-connect", JSON.stringify({ on: true, at: 0 }));
    callFn.mockRejectedValue(notEnabled());
    expect(await checkSocialConnect()).toBe(false);
    expect(socialConnectShown()).toBe(false);
  });

  it("keeps the last answer when the server can't be reached, and forgets on sign-out", async () => {
    callFn.mockRejectedValue(new EdgeError("Couldn't reach the server.", 0));
    expect(await checkSocialConnect()).toBe(false);
    expect(socialConnectShown()).toBe(false);
    localStorage.setItem("cs-social-connect", JSON.stringify({ on: true, at: 0 }));
    expect(await checkSocialConnect()).toBe(true);
    forgetSocialConnect();
    expect(socialConnectShown()).toBe(false);
  });
});

describe("removing a brand", () => {
  it("disconnects every account in it first", async () => {
    callFn.mockResolvedValue({ disconnected: 2 });
    await disconnectBrand("pmg1x2");
    expect(callFn).toHaveBeenCalledWith("social", { action: "disconnect", profileId: "pmg1x2", all: true });
  });

  it("stops on any failure, Not enabled too, so the brand and its accounts stay", async () => {
    callFn.mockRejectedValue(notEnabled());
    await expect(disconnectBrand("p1")).rejects.toThrow("Not enabled.");
    callFn.mockRejectedValue(new EdgeError("Couldn't reach your social accounts.", 502));
    await expect(disconnectBrand("p1")).rejects.toThrow("Couldn't reach");
    callFn.mockRejectedValue(new EdgeError("Not found.", 404));
    await expect(disconnectBrand("p1")).rejects.toThrow("Not found.");
  });
});

describe("words on the page", () => {
  it("says when no account can be added, and why", () => {
    expect(capLine({ team: 1, teamCap: 2, user: 1, userCap: 6 })).toBeNull();
    expect(capLine({ team: 2, teamCap: 2, user: 1, userCap: 6 })).toBe("2 of 2 accounts connected. Disconnect one to connect another.");
    expect(capLine({ team: 6, teamCap: 50, user: 6, userCap: 6 })).toMatch(/^6 of 6 accounts connected, the most one adviser can have/);
  });

  it("reads Zernio's redirect back", () => {
    expect(readRedirect(new URLSearchParams("connected=instagram&profileId=x&accountId=y&username=moneybees"))).toEqual({ ok: true, text: "Instagram connected: @moneybees." });
    expect(readRedirect(new URLSearchParams("connected=tiktok&error=oauth_denied&platform=tiktok&error_message=You%20cancelled.%0A%20Try%20again"))).toEqual({
      ok: false,
      text: "TikTok didn't connect. You cancelled. Try again",
    });
    expect(readRedirect(new URLSearchParams("connected=facebook&error=no_facebook_pages&platform=facebook"))).toEqual({ ok: false, text: "Facebook didn't connect. Try again." });
    expect(readRedirect(new URLSearchParams(`error=x&error_message=${"a".repeat(500)}`))?.text.length).toBeLessThan(240);
    expect(readRedirect(new URLSearchParams(""))).toBeNull();
  });

  it("says what a removal was in plain words", () => {
    expect(removedLine({ platform: "instagram", username: "bee", at: "2026-10-11T08:00:00Z" })).toBe("@bee on Instagram was disconnected on 11 Oct because it went over the account limit.");
    expect(removedLine({ platform: "threads", username: "", at: "2026-10-10T20:00:00Z" })).toBe("Your Threads account was disconnected on 11 Oct because it went over the account limit.");
  });

  it("labels health", () => {
    const a = { id: "1", platform: "instagram", username: "", name: "", url: null, picture: null, issues: [] };
    expect(healthLabel({ ...a, health: "healthy", needsReconnect: false })).toBe("Working");
    expect(healthLabel({ ...a, health: "healthy", needsReconnect: true })).toBe("Reconnect needed");
    expect(healthLabel({ ...a, health: "warning", needsReconnect: false })).toBe("Needs a look");
  });
});

// publish-accounts (Leo only): the page grouped by platform, the count line, a default per platform, and the way back
// to the post a connect started from.
const acct = (id: string, platform: string, username = id) => ({ id, platform, username, name: "", url: null, picture: null, health: "healthy" as const, needsReconnect: false, issues: [] });

describe("the count line", () => {
  it("names whichever limit stops the next connect", () => {
    expect(countLine({ team: 3, teamCap: 20, user: 3, userCap: 6 })).toBe("3 of 6 accounts connected.");
    // today's team cap of 2 with one account on the team
    expect(countLine({ team: 1, teamCap: 2, user: 1, userCap: 6 })).toBe("1 of 2 accounts connected.");
    // other advisers' accounts leave less room on the team than this adviser's own cap
    expect(countLine({ team: 8, teamCap: 10, user: 1, userCap: 6 })).toBe("1 of 3 accounts connected.");
  });

  it("gives way to today's cap line when no account can be added", () => {
    for (const full of [{ team: 2, teamCap: 2, user: 1, userCap: 6 }, { team: 6, teamCap: 50, user: 6, userCap: 6 }, { team: 9, teamCap: 2, user: 1, userCap: 6 }]) {
      expect(countLine(full)).toBe(capLine(full));
      expect(countLine(full)).not.toBeNull();
    }
  });
});

describe("accounts grouped by platform", () => {
  it("gives one group per platform in SOCIAL_PLATFORMS order, with the button that fits", () => {
    const groups = groupAccounts([acct("t1", "tiktok"), acct("i1", "instagram"), acct("i2", "instagram")], {});
    expect(groups.map((g) => g.platform)).toEqual(["instagram", "facebook", "tiktok", "linkedin", "youtube", "threads"]);
    expect(groups[0]).toMatchObject({ name: "Instagram", showDefault: true, defaultId: "i1", button: "Add another Instagram account" });
    expect(groups[0].accounts.map((a) => a.id)).toEqual(["i1", "i2"]);
    expect(groups[1]).toMatchObject({ accounts: [], showDefault: false, defaultId: null, button: "Connect Facebook" });
    // one account is the default, with nothing to pick
    expect(groups[2]).toMatchObject({ showDefault: false, defaultId: "t1", button: "Add another TikTok account" });
    expect(groups[3].button).toBe("Connect LinkedIn");
  });

  it("ticks the picked default and keeps an account on a platform the app can't connect, with no button", () => {
    const groups = groupAccounts([acct("i1", "instagram"), acct("i2", "instagram"), acct("p1", "pinterest")], { instagram: "i2" });
    expect(groups[0].defaultId).toBe("i2");
    expect(groups).toHaveLength(7);
    expect(groups[6]).toMatchObject({ platform: "pinterest", name: "pinterest", button: null, showDefault: false });
  });
});

describe("a default account per platform", () => {
  it("ignores an id no longer among the accounts and falls back to the first connected one", () => {
    const ig = [acct("i1", "instagram"), acct("i2", "instagram")];
    expect(defaultAccount(ig, { instagram: "i2" }, "instagram")).toBe("i2");
    expect(defaultAccount(ig, { instagram: "gone" }, "instagram")).toBe("i1");
    // an id from another platform's list never counts
    expect(defaultAccount([...ig, acct("t1", "tiktok")], { instagram: "t1" }, "instagram")).toBe("i1");
    expect(defaultAccount(ig, {}, "tiktok")).toBeNull();
  });

  it("is saved per brand and read back, and anything unreadable reads as none", () => {
    expect(loadSocialDefaults("u1")).toEqual({});
    expect(saveSocialDefault("u1", "instagram", "i2")).toBe(true);
    expect(saveSocialDefault("u1", "tiktok", "t1")).toBe(true);
    expect(loadSocialDefaults("u1")).toEqual({ instagram: "i2", tiktok: "t1" });
    expect(JSON.parse(localStorage.getItem("content-studio-social-defaults-u1")!)).toEqual({ instagram: "i2", tiktok: "t1" });
    localStorage.setItem("content-studio-social-defaults-u1", JSON.stringify({ instagram: 7, tiktok: "t1", x: ["a"] }));
    expect(loadSocialDefaults("u1")).toEqual({ tiktok: "t1" });
    localStorage.setItem("content-studio-social-defaults-u1", "{not json");
    expect(loadSocialDefaults("u1")).toEqual({});
  });

  it("says so when this device's storage is full, keeping what was saved", () => {
    saveSocialDefault("u1", "instagram", "i1");
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(saveSocialDefault("u1", "instagram", "i2")).toBe(false);
    expect(loadSocialDefaults("u1")).toEqual({ instagram: "i1" });
  });
});

describe("the way back after connecting", () => {
  const now = Date.UTC(2026, 9, 25, 2, 0);

  it("returns the saved path and query for 30 minutes, then nothing", () => {
    saveConnectReturn("/drafts?schedule=d1&step=where", now);
    expect(readConnectReturn(now + 29 * 60_000)).toBe("/drafts?schedule=d1&step=where");
    expect(readConnectReturn(now + 31 * 60_000)).toBeNull();
    clearConnectReturn();
    expect(readConnectReturn(now)).toBeNull();
  });

  it("never returns a path outside this app, or anything unreadable", () => {
    for (const path of ["https://evil.example/x", "//evil.example/x", "/\\evil.example", "drafts", ""]) {
      sessionStorage.setItem("cs-connect-return", JSON.stringify({ path, at: now }));
      expect(readConnectReturn(now), path).toBeNull();
    }
    sessionStorage.setItem("cs-connect-return", "{not json");
    expect(readConnectReturn(now)).toBeNull();
    sessionStorage.setItem("cs-connect-return", JSON.stringify({ path: "/calendar", at: "soon" }));
    expect(readConnectReturn(now)).toBeNull();
  });
});

describe("the channels cache (the sidebar's Channels block and Home's Next up)", () => {
  const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
  const acct = (o: Partial<AccountView> = {}): AccountView => ({
    id: "zac_1", platform: "instagram", username: "moneybees.sg", name: "MoneyBees SG", url: null, picture: null, health: "healthy", needsReconnect: false, issues: [], ...o,
  });
  const status = (accounts: AccountView[]) => ({ enabled: true, accounts, removed: [], team: accounts.length, teamCap: 10, user: accounts.length, userCap: 6 });

  it("is written per brand by every status read, with platform, handle, health and read time only", async () => {
    signIn(UID);
    vi.useFakeTimers({ now: new Date("2026-10-27T02:00:00Z") });
    callFn.mockResolvedValue(status([acct(), acct({ id: "zac_2", platform: "tiktok", username: "@mb.tok", needsReconnect: true, issues: ["Token expired"] })]));
    expect(loadChannels(UID, "me")).toBeNull();
    await socialStatus("me");
    expect(callFn).toHaveBeenCalledWith("social", { action: "status", profileId: "me" }, expect.any(String));
    expect(loadChannels(UID, "me")).toEqual({
      at: Date.parse("2026-10-27T02:00:00Z"),
      channels: [
        { platform: "instagram", username: "moneybees.sg", health: "healthy" },
        { platform: "tiktok", username: "mb.tok", health: "error" },
      ],
    });
    // no account ids, names or issues on the device
    expect(localStorage.getItem(`cs-social-channels-${UID}`)).not.toMatch(/zac_|MoneyBees SG|Token/);
    // each brand keeps its own
    callFn.mockResolvedValue(status([]));
    await socialStatus("p2");
    expect(loadChannels(UID, "p2")?.channels).toEqual([]);
    expect(loadChannels(UID, "me")?.channels).toHaveLength(2);
    // another sign-in on this device reads nothing
    expect(loadChannels("someone-else", "me")).toBeNull();
    expect(loadChannels(null, "me")).toBeNull();
  });

  it("keeps the last answer when a read fails, and writes nothing with no one signed in", async () => {
    signIn(UID);
    callFn.mockResolvedValue(status([acct()]));
    await socialStatus("me");
    callFn.mockRejectedValue(new EdgeError("Couldn't reach the server.", 0));
    await expect(socialStatus("me")).rejects.toThrow();
    expect(loadChannels(UID, "me")?.channels).toHaveLength(1);
    signIn(null);
    callFn.mockResolvedValue(status([]));
    await socialStatus("me");
    expect(loadChannels(UID, "me")?.channels).toHaveLength(1);
  });

  it("tells its listeners each time it is written", async () => {
    const win = new EventTarget();
    vi.stubGlobal("window", win);
    signIn(UID);
    const seen = vi.fn();
    const off = onChannelsChanged(seen);
    callFn.mockResolvedValue(status([acct()]));
    await socialStatus("me");
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    await socialStatus("me");
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("reads anything unreadable as never read", () => {
    for (const bad of ["{", "[]", "null", JSON.stringify({ me: { at: "today", channels: [] } }), JSON.stringify({ me: { at: 1, channels: "x" } })]) {
      localStorage.setItem(`cs-social-channels-${UID}`, bad);
      expect(loadChannels(UID, "me"), bad).toBeNull();
    }
  });
});
