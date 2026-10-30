import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", supabase: { auth: { getSession, onAuthStateChange: () => ({}) } } }));

import { leoUser } from "./useLeoOnly";

describe("leoUser", () => {
  it("reads the session again when a read loses the auth lock, instead of answering 'not Leo'", async () => {
    getSession.mockRejectedValueOnce(new Error("Lock broken by another request with the 'steal' option."));
    getSession.mockResolvedValueOnce({ data: { session: { user: { id: "u1", email: "tanjunsing@gmail.com" } } } });
    await expect(leoUser()).resolves.toEqual({ id: "u1", email: "tanjunsing@gmail.com" });
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("answers unknown, not 'not Leo', when both reads lose the lock, and reads again next time", async () => {
    vi.resetModules();
    getSession.mockReset();
    const { leoUser: fresh } = await import("./useLeoOnly");
    getSession.mockRejectedValueOnce(new Error("Lock broken")).mockRejectedValueOnce(new Error("Lock broken"));
    await expect(fresh()).resolves.toBeUndefined();
    getSession.mockResolvedValueOnce({ data: { session: { user: { id: "u2", email: "someone@example.com" } } } });
    await expect(fresh()).resolves.toBeNull();
    expect(getSession).toHaveBeenCalledTimes(3);
  });
});

describe("useLeoUser's first frame", () => {
  afterEach(() => vi.unstubAllGlobals());

  // the hook's state before any effect runs (server render runs none), read from a fresh module like a page load
  async function firstFrame(stored: unknown) {
    vi.stubGlobal("localStorage", { getItem: (k: string) => (k === "sb-abc-auth-token" && stored ? JSON.stringify(stored) : null) });
    vi.resetModules();
    const { useLeoUser } = await import("./useLeoOnly");
    return renderToStaticMarkup(
      createElement(() => {
        const u = useLeoUser();
        return u ? `${u.id} ${u.email}` : String(u);
      }),
    );
  }

  it("is Leo straight from the stored session, so his cards never show today's link first", async () => {
    expect(await firstFrame({ user: { id: "u1", email: "tanjunsing@gmail.com" } })).toBe("u1 tanjunsing@gmail.com");
  });

  it("is 'not Leo' for anyone else's stored session, and unknown with none", async () => {
    expect(await firstFrame({ user: { id: "u2", email: "someone@example.com" } })).toBe("null");
    expect(await firstFrame(null)).toBe("undefined");
  });
});


describe("useSignedInUser's first frame", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function firstFrame(stored: unknown) {
    vi.stubGlobal("localStorage", { getItem: (k: string) => (k === "sb-abc-auth-token" && stored ? JSON.stringify(stored) : null) });
    vi.resetModules();
    const { useSignedInUser } = await import("./useLeoOnly");
    return renderToStaticMarkup(
      createElement(() => {
        const u = useSignedInUser();
        return u ? `${u.id} ${u.email}` : String(u);
      }),
    );
  }

  it("is any stored sign-in, Leo's or not, for pages that are on for everyone; unknown with none", async () => {
    expect(await firstFrame({ user: { id: "u2", email: "someone@example.com" } })).toBe("u2 someone@example.com");
    expect(await firstFrame({ user: { id: "u1", email: "tanjunsing@gmail.com" } })).toBe("u1 tanjunsing@gmail.com");
    expect(await firstFrame(null)).toBe("undefined");
  });
});
