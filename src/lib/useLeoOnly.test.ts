import { describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getSession, onAuthStateChange: () => ({}) } } }));

import { leoUser } from "./useLeoOnly";

describe("leoUser", () => {
  it("reads the session again when a read loses the auth lock, instead of answering 'not Leo'", async () => {
    getSession.mockRejectedValueOnce(new Error("Lock broken by another request with the 'steal' option."));
    getSession.mockResolvedValueOnce({ data: { session: { user: { id: "u1", email: "tanjunsing@gmail.com" } } } });
    await expect(leoUser()).resolves.toEqual({ id: "u1", email: "tanjunsing@gmail.com" });
    expect(getSession).toHaveBeenCalledTimes(2);
  });
});
