import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { PUBLIC_PATH, readTheme, resolveTheme } from "./theme";

describe("theme", () => {
  it("leaves the public pages light and darkens every studio page", () => {
    for (const p of ["/auth", "/roadmap", "/review/abc", "/l/leo", "/join", "/t/report/x", "/phone/abc"]) expect(PUBLIC_PATH.test(p), p).toBe(true);
    for (const p of ["/home", "/library", "/links", "/team", "/tutorial", "/agent/t1", "/phones"]) expect(PUBLIC_PATH.test(p), p).toBe(false);
  });

  it("uses the same public list in index.html's first paint", () => {
    expect(readFileSync("index.html", "utf8")).toContain(PUBLIC_PATH.source);
  });

  it("darkens the first paint only for a device that chose dark, or System on a dark device", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).toContain('var dark = pick === "dark" || (pick === "system" && matchMedia("(prefers-color-scheme: dark)").matches);');
    expect(html).toMatch(/\.test\(location\.pathname\) && dark\)/);
  });

  it("is light unless this device chose dark, and light when storage is blocked", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null });
    expect(readTheme()).toBe("light");
    store.set("cs-theme", "dark");
    expect(readTheme()).toBe("dark");
    store.set("cs-theme", "light");
    expect(readTheme()).toBe("light");
    store.set("cs-theme", "system");
    expect(readTheme()).toBe("system");
    store.set("cs-theme", "sepia");
    expect(readTheme()).toBe("light");
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); } });
    expect(readTheme()).toBe("light");
    vi.unstubAllGlobals();
  });

  it("draws Light and Dark as picked, and System as the device is set", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});
