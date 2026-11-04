import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleAfterLoad, scheduleIdle } from "./idle";

// sentry-boot.ts fetches the Sentry SDK through scheduleAfterLoad, so the error reporter never competes with the
// first page's own requests.
let onLoad: (() => void) | null;
let idle: (() => void) | null;
const page = (readyState: string, withIdle = true) => {
  onLoad = null;
  idle = null;
  vi.stubGlobal("document", { readyState });
  vi.stubGlobal("window", {
    setTimeout,
    clearTimeout,
    addEventListener: (type: string, fn: () => void) => {
      if (type === "load") onLoad = fn;
    },
    ...(withIdle ? { requestIdleCallback: (fn: () => void) => ((idle = fn), 1), cancelIdleCallback: () => (idle = null) } : {}),
  });
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("after the page has loaded", () => {
  it("waits for the load event, then the delay, then an idle moment", () => {
    page("loading");
    const cb = vi.fn();
    scheduleAfterLoad(3000, cb);
    vi.advanceTimersByTime(10_000);
    expect(idle).toBeNull();
    onLoad!();
    vi.advanceTimersByTime(2999);
    expect(idle).toBeNull();
    vi.advanceTimersByTime(1);
    expect(cb).not.toHaveBeenCalled();
    idle!();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("starts the delay at once when the page has already loaded", () => {
    page("complete");
    const cb = vi.fn();
    scheduleAfterLoad(3000, cb);
    expect(onLoad).toBeNull();
    vi.advanceTimersByTime(3000);
    idle!();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("falls back to a short timer where the browser has no idle callback (Safari), and can be cancelled", () => {
    page("complete", false);
    const cb = vi.fn();
    scheduleIdle(cb);
    vi.advanceTimersByTime(200);
    expect(cb).toHaveBeenCalledTimes(1);
    const later = vi.fn();
    scheduleIdle(later)();
    vi.advanceTimersByTime(1000);
    expect(later).not.toHaveBeenCalled();
  });
});
