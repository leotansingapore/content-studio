import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));

import { addProfile, setActiveProfile } from "./profiles";
import { FIT_COPY, MAX_FITS, fitAsk, fitVideo, loadFit, pressAction, requestFit, saveFit } from "./remixFit";
import type { RemixSource } from "./remixSource";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

let local: MemStorage;
beforeEach(() => {
  local = new MemStorage();
  vi.stubGlobal("window", { localStorage: local, sessionStorage: new MemStorage() });
  vi.stubGlobal("localStorage", local);
  invoke.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const reel: RemixSource = { key: "top:a-b", kind: "top-post", format: "video", caption: "6 signs your CPF plan is off track", remixedAt: "" };
const brand = () => local.setItem(`content-studio-positioning-${UID}`, JSON.stringify({ oneLiner: "I help fresh grads", audience: "young-adult", topics: ["CPF"] }));

describe("pressAction", () => {
  it("asks first on weak and poor until confirmed, and starts at once on good and unknown", () => {
    expect(pressAction("weak", false)).toBe("ask");
    expect(pressAction("poor", false)).toBe("ask");
    expect(pressAction("weak", true)).toBe("start");
    expect(pressAction("poor", true)).toBe("start");
    expect(pressAction("good", false)).toBe("start");
    expect(pressAction("unknown", false)).toBe("start");
    expect(fitAsk("weak")).toBe("This one is a weak fit. Remix anyway?");
    expect(fitAsk("poor")).toBe("This one isn't recommended. Remix anyway?");
    expect(fitAsk("good")).toBeNull();
    expect(FIT_COPY.good("MoneyBees")).toBe("Good fit for MoneyBees.");
  });
});

describe("fitVideo", () => {
  it("is a video check only for a video made from a video or carousel", () => {
    expect(fitVideo({ format: "video" }, true)).toBe(true);
    expect(fitVideo({ format: "carousel" }, true)).toBe(true);
    expect(fitVideo({ format: "text" }, true)).toBe(false);
    expect(fitVideo({ format: "video" }, false)).toBe(false);
  });
});

describe("the fit cache", () => {
  it("keeps an answer 7 days per brand, never an unknown, and at most 200", () => {
    const now = new Date("2026-10-20T00:00:00Z");
    saveFit(UID, "top:a-b", true, { verdict: "weak", reasons: ["retell", "textHeavy"] }, now);
    expect(loadFit(UID, "top:a-b", true, now)).toEqual({ verdict: "weak", reasons: ["retell", "textHeavy"] });
    expect(loadFit(UID, "top:a-b", false, now)).toBeNull();
    expect(loadFit(UID, "top:a-b", true, new Date("2026-10-26T23:00:00Z"))).not.toBeNull();
    expect(loadFit(UID, "top:a-b", true, new Date("2026-10-27T00:00:01Z"))).toBeNull();
    saveFit(UID, "ad:1", false, { verdict: "unknown", reasons: [] }, now);
    expect(loadFit(UID, "ad:1", false, now)).toBeNull();

    const p = addProfile(UID, "MoneyBees");
    setActiveProfile(UID, p.id);
    expect(loadFit(UID, "top:a-b", true, now)).toBeNull();
    setActiveProfile(UID, "me");

    for (let i = 0; i < MAX_FITS + 5; i++) saveFit(UID, `ad:${i}`, false, { verdict: "good", reasons: [] }, new Date(now.getTime() + (i + 1) * 1000));
    const kept = JSON.parse(local.getItem(`cs-remix-fit-${UID}`)!);
    expect(Object.keys(kept)).toHaveLength(MAX_FITS);
    expect(kept["ad:0|text"]).toBeUndefined();
    expect(kept[`ad:${MAX_FITS + 4}|text`]).toBeDefined();
  });
});

describe("requestFit", () => {
  it("asks the server once with the brand's four fields, keeps the answer, and reads it back with no call", async () => {
    brand();
    invoke.mockResolvedValue({ data: { verdict: "poor", reasons: ["serves"] }, error: null });
    expect(await requestFit(UID, reel, true)).toEqual({ verdict: "poor", reasons: ["serves"] });
    expect(invoke).toHaveBeenCalledTimes(1);
    const sent = invoke.mock.calls[0][1].body;
    expect(sent).toMatchObject({ mode: "fit", video: true, source: { key: "top:a-b", kind: "top-post", format: "video" }, brand: { oneLiner: "I help fresh grads", topics: ["CPF"] } });
    expect(Object.keys(sent.brand).sort()).toEqual(["audience", "name", "oneLiner", "speaker", "topics"]);
    expect(sent.brand.speaker).toBe("person");
    expect(await requestFit(UID, reel, true)).toEqual({ verdict: "poor", reasons: ["serves"] });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("sends the For row's speaker, and keeps a business's answer apart from the adviser's (it has no MAS-safe reason)", async () => {
    brand();
    invoke.mockResolvedValue({ data: { verdict: "weak", reasons: ["masSafe"] }, error: null });
    expect(await requestFit(UID, reel, false)).toEqual({ verdict: "weak", reasons: ["masSafe"] });
    invoke.mockResolvedValue({ data: { verdict: "good", reasons: [] }, error: null });
    expect(await requestFit(UID, reel, false, "business")).toEqual({ verdict: "good", reasons: [] });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1][1].body.brand.speaker).toBe("business");
    expect(loadFit(UID, reel.key, false)).toEqual({ verdict: "weak", reasons: ["masSafe"] });
    expect(loadFit(UID, reel.key, false, new Date(), "business")).toEqual({ verdict: "good", reasons: [] });
  });

  it("gives unknown with no call when the brand says nothing about who it serves, and on any failure", async () => {
    expect(await requestFit(UID, reel, false)).toEqual({ verdict: "unknown", reasons: [] });
    expect(invoke).not.toHaveBeenCalled();
    brand();
    invoke.mockRejectedValue(new Error("offline"));
    expect(await requestFit(UID, reel, false)).toEqual({ verdict: "unknown", reasons: [] });
    invoke.mockResolvedValue({ data: { verdict: "unknown", reasons: [] }, error: null });
    await requestFit(UID, reel, false);
    await requestFit(UID, reel, false);
    // an unknown is never kept, so the next open asks again
    expect(invoke).toHaveBeenCalledTimes(3);
  });
});
