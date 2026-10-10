import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));

const { EdgeError } = await import("@/lib/edgeFn");
const { capLine, checkSocialConnect, disconnectBrand, forgetSocialConnect, healthLabel, readRedirect, removedLine, socialConnectShown } = await import("./socialConnect");

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemStorage());
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

  it("goes ahead when social isn't switched on, and stops on any other failure", async () => {
    callFn.mockRejectedValue(notEnabled());
    await expect(disconnectBrand("p1")).resolves.toBeUndefined();
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
