import { describe, expect, it, vi } from "vitest";
import { lockLost, shareCall } from "./shareCall";

const LOST = new Error("Lock broken by another request with the 'steal' option.");

describe("shareCall", () => {
  it("gives every caller made while one is running the same answer from one request", async () => {
    let calls = 0;
    const run = shareCall(async () => ({ n: ++calls }));
    const [a, b, c] = await Promise.all([run(), run(), run()]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
    // once it has settled, the next call asks again: a sign-in or sign-out since is seen
    expect(await run()).toEqual({ n: 2 });
  });

  it("asks once more when the auth lock was taken over, and passes any other failure on", async () => {
    const fn = vi.fn().mockRejectedValueOnce(LOST).mockResolvedValueOnce("user");
    expect(await shareCall(fn)()).toBe("user");
    expect(fn).toHaveBeenCalledTimes(2);
    const boom = new Error("network down");
    const other = vi.fn().mockRejectedValue(boom);
    await expect(shareCall(other)()).rejects.toBe(boom);
    expect(other).toHaveBeenCalledTimes(1);
    // a second lost lock is not retried forever
    const twice = vi.fn().mockRejectedValue(LOST);
    await expect(shareCall(twice)()).rejects.toBe(LOST);
    expect(twice).toHaveBeenCalledTimes(2);
  });

  it("knows auth-js's lost-lock messages", () => {
    expect(lockLost(LOST)).toBe(true);
    expect(lockLost(new Error('Lock "lock:sb-x-auth-token" was released because another request stole it'))).toBe(true);
    expect(lockLost(new Error("Invalid JWT"))).toBe(false);
    expect(lockLost(undefined)).toBe(false);
  });
});
