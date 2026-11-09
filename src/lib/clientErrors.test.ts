import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

describe("reloadForNewVersion", () => {
  let reload: ReturnType<typeof vi.fn>;
  let listeners: Record<string, (e: Event) => void>;

  beforeEach(() => {
    vi.resetModules();
    reload = vi.fn();
    listeners = {};
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      location: { reload },
      sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
      addEventListener: (type: string, fn: (e: Event) => void) => (listeners[type] = fn),
    });
  });

  it("reloads once and reports a reload underway to every later caller in the same page", async () => {
    const { reloadForNewVersion } = await import("@/lib/clientErrors");
    expect(reloadForNewVersion()).toBe(true);
    expect(reloadForNewVersion()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("lets a failed import throw, so lazy() never gets an undefined module", async () => {
    const { installGlobalErrorHandlers } = await import("@/lib/clientErrors");
    installGlobalErrorHandlers();
    const event = { preventDefault: vi.fn() } as unknown as Event;
    listeners["vite:preloadError"](event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not loop when a reload just failed to help", async () => {
    window.sessionStorage.setItem("cs-chunk-reload-at", String(Date.now()));
    const { reloadForNewVersion } = await import("@/lib/clientErrors");
    expect(reloadForNewVersion()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
