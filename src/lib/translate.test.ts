import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftEntry } from "@/lib/draftHistory";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));

const { textKey } = await import("@/lib/postScore");
const { asPostLang, isStale, langOf, LANG_NAMES, SAME_WARN, sameWarns, sourceOf, translatePost } = await import("./translate");

const junk = (v: unknown) => v as never;
const english: Pick<DraftEntry, "platform" | "draft"> = { platform: "linkedin", draft: "Most people pay twice for a hospital stay.\n\nComment PLAN." };
const link = { id: "src-1", key: textKey(english.platform, english.draft), at: "2026-10-21T10:00:00.000Z" };

beforeEach(() => callFn.mockReset());

describe("langOf", () => {
  it("returns a known language, and null (English) for an unknown one or none", () => {
    expect(langOf({ lang: "zh" })).toBe("zh");
    expect(langOf({ lang: "ms" })).toBe("ms");
    expect(langOf({ lang: "ta" })).toBe("ta");
    expect(langOf({ lang: junk("fr") })).toBeNull();
    expect(langOf({ lang: junk("ZH") })).toBeNull();
    expect(langOf({})).toBeNull();
    expect(asPostLang(42)).toBeNull();
    expect(LANG_NAMES).toEqual({ zh: "Chinese", ms: "Malay", ta: "Tamil" });
  });
  it("reads an older draft, saved before versions, as English with no source", () => {
    const old = JSON.parse('{"id":"a","createdAt":"2026-09-01","hook":"Hi","draft":"Hi","pillar":"","pillarDetail":"","audience":"","format":"","platform":"linkedin","ctaType":""}') as DraftEntry;
    expect(langOf(old)).toBeNull();
    expect(sourceOf(old)).toBeNull();
    expect(isStale(old, english)).toBe(false);
  });
});

describe("sourceOf", () => {
  it("returns the link when its three fields are text", () => {
    expect(sourceOf({ translationOf: link })).toEqual(link);
    expect(sourceOf({ translationOf: junk({ ...link, extra: 1 }) })).toEqual(link);
  });
  it("returns null for a malformed link", () => {
    expect(sourceOf({ translationOf: junk("src-1") })).toBeNull();
    expect(sourceOf({ translationOf: junk(null) })).toBeNull();
    expect(sourceOf({ translationOf: junk({ id: "src-1", key: link.key }) })).toBeNull();
    expect(sourceOf({ translationOf: junk({ ...link, at: 5 }) })).toBeNull();
    expect(sourceOf({ translationOf: junk({ ...link, id: null }) })).toBeNull();
  });
});

describe("isStale", () => {
  it("is false while the English reads as it did, whitespace round it aside", () => {
    expect(isStale({ translationOf: link }, english)).toBe(false);
    expect(isStale({ translationOf: link }, { ...english, draft: `  ${english.draft}\n` })).toBe(false);
  });
  it("is true once the English changed after the version was made, or moved to another platform", () => {
    expect(isStale({ translationOf: link }, { ...english, draft: english.draft.replace("twice", "three times") })).toBe(true);
    expect(isStale({ translationOf: link }, { ...english, platform: "instagram" })).toBe(true);
  });
  it("is false when the English is gone, or the version has no good link", () => {
    expect(isStale({ translationOf: link }, null)).toBe(false);
    expect(isStale({ translationOf: link }, undefined)).toBe(false);
    expect(isStale({ translationOf: junk({ id: "src-1" }) }, english)).toBe(false);
  });
});

describe("the same-meaning warning", () => {
  it("stays in shadow: no cut is set, so nothing warns", () => {
    expect(SAME_WARN).toBeNull();
    expect(sameWarns(0.01)).toBe(false);
  });
  it("warns under a set cut, and never when Jev had no answer", () => {
    expect(sameWarns(0.59, 0.6)).toBe(true);
    expect(sameWarns(0.6, 0.6)).toBe(false);
    expect(sameWarns(null, 0.6)).toBe(false);
    expect(sameWarns(undefined, 0.6)).toBe(false);
  });
});

describe("translatePost", () => {
  it("sends the post's lines, empty ones kept, and joins the version on the same breaks", async () => {
    callFn.mockResolvedValue({ lines: ["Ramai orang bayar dua kali.", "", "Komen PLAN."], back: ["Many people pay twice.", "", "Comment PLAN."], same: 0.9 });
    const out = await translatePost("ms", "Most people pay twice.\n\nComment PLAN.");
    expect(callFn).toHaveBeenCalledWith(
      "video-assist",
      { mode: "translate", kind: "post", back: true, lang: "ms", lines: ["Most people pay twice.", "", "Comment PLAN."] },
      "Couldn't translate it right now. Try again in a minute.",
    );
    expect(out).toEqual({ text: "Ramai orang bayar dua kali.\n\nKomen PLAN.", back: ["Many people pay twice.", "", "Comment PLAN."], same: 0.9 });
  });
  it("reads a missing answer from Jev as null", async () => {
    callFn.mockResolvedValue({ lines: ["a"], back: ["a"], same: null });
    expect((await translatePost("zh", "a")).same).toBeNull();
    callFn.mockResolvedValue({ lines: ["a"], back: ["a"] });
    expect((await translatePost("zh", "a")).same).toBeNull();
  });
});
