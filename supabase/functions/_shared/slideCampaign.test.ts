import { describe, expect, it } from "vitest";
import { nextRunAt, ownUpload, parseWriter, pickHook, pickImages, postsPerWeek, runPlan, sanitizePublish, sanitizeSchedule, sanitizeSpec, slotKey, writerPrompt } from "./slideCampaign.ts";
import { lookFilterSvg, overlayCss } from "./slideStyle.ts";

describe("slideshow campaigns", () => {
  it("spec: defaults, clamps and drops what it can't use", () => {
    const s = sanitizeSpec({
      hooks: [" A ", "A", "", "B"],
      content: { slides: 99, style: "weird" },
      images: { hook: "not-a-uuid", content: "11111111-2222-3333-4444-555555555555" },
      look: "nope",
      text_style: { hook: { font: "Comic Sans", color: "red" } },
    });
    expect(s.hooks).toEqual(["A", "B"]);
    expect(s.content.slides).toBe(10);
    expect(s.content.style).toBe("plain");
    expect(s.images.hook).toBeNull();
    expect(s.images.content).toBe("11111111-2222-3333-4444-555555555555");
    expect(s.look).toBe("none");
    expect(s.text_style.hook.font).toBe("TikTok Sans");
    expect(s.text_style.hook.color).toBe("#ffffff");
    expect(s.format).toBe("tiktok");
  });

  it("publishing is TikTok drafts only, whatever is sent", () => {
    expect(sanitizePublish({})).toEqual({ mode: "inbox" });
    expect(sanitizePublish({ mode: "direct" })).toEqual({ mode: "inbox" });
  });

  it("uploads: only the owner's folder, a fresh id and a picture ending", () => {
    const uid = "00000000-0000-4000-8000-00000000000a";
    expect(ownUpload(uid, `${uid}/lib/11111111-2222-3333-4444-555555555555.jpg`)).toBe(true);
    expect(ownUpload(uid, `${uid}/lib/../../00000000-0000-4000-8000-00000000000b/runs/x/1.png`)).toBe(false);
    expect(ownUpload(uid, `${uid}/lib/11111111-2222-3333-4444-555555555555.svg`)).toBe(false);
    expect(ownUpload(uid, `00000000-0000-4000-8000-00000000000b/lib/11111111-2222-3333-4444-555555555555.jpg`)).toBe(false);
  });

  it("slot keys: one UUID per campaign and posting time", async () => {
    const at = new Date("2026-11-01T01:00:00Z");
    const k = await slotKey("c1", at);
    expect(k).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await slotKey("c1", at)).toBe(k);
    expect(await slotKey("c1", new Date("2026-11-02T01:00:00Z"))).not.toBe(k);
    expect(await slotKey("c2", at)).not.toBe(k);
  });

  it("schedule: keeps good times, drops bad ones, falls back to Singapore", () => {
    const s = sanitizeSchedule({ tz: "Mars/Base", times: [{ at: "9:00", days: [1] }, { at: "18:30", days: [1, 1, 7, 3] }, { at: "07:00", days: [] }] });
    expect(s).toEqual({ tz: "Asia/Singapore", times: [{ at: "18:30", days: [1, 3] }] });
    const week = { tz: "UTC", times: [{ at: "09:00", days: [0, 1, 2, 3, 4, 5, 6] }, { at: "18:00", days: [1, 3] }] };
    expect(postsPerWeek(week)).toBe(9);
  });

  it("next run: the first slot after now, in the schedule's zone", () => {
    const sg = { tz: "Asia/Singapore", times: [{ at: "09:00", days: [0, 1, 2, 3, 4, 5, 6] }, { at: "18:00", days: [1] }] };
    // Saturday 31 Oct 2026 10:00 SGT = 02:00Z: next is Sunday 09:00 SGT
    expect(nextRunAt(sg, new Date("2026-10-31T02:00:00Z"))?.toISOString()).toBe("2026-11-01T01:00:00.000Z");
    // Monday 2 Nov 12:00 SGT: the 18:00 Monday slot comes first
    expect(nextRunAt(sg, new Date("2026-11-02T04:00:00Z"))?.toISOString()).toBe("2026-11-02T10:00:00.000Z");
    // exactly at a slot moves to the next one
    expect(nextRunAt(sg, new Date("2026-11-01T01:00:00Z"))?.toISOString()).toBe("2026-11-02T01:00:00.000Z");
    expect(nextRunAt({ tz: "UTC", times: [] }, new Date())).toBeNull();
  });

  it("next run: a zone with daylight saving keeps the wall-clock time", () => {
    const ny = { tz: "America/New_York", times: [{ at: "09:00", days: [0, 1, 2, 3, 4, 5, 6] }] };
    // DST ends Sunday 1 Nov 2026 in New York: 09:00 EDT is 13:00Z on Saturday, 09:00 EST is 14:00Z on Sunday
    expect(nextRunAt(ny, new Date("2026-10-31T12:00:00Z"))?.toISOString()).toBe("2026-10-31T13:00:00.000Z");
    expect(nextRunAt(ny, new Date("2026-10-31T13:00:00Z"))?.toISOString()).toBe("2026-11-01T14:00:00.000Z");
  });

  it("hooks: random, avoiding last time's when there is another", () => {
    expect(pickHook(["a", "b"], "a", () => 0)).toBe("b");
    expect(pickHook(["a"], "a", () => 0)).toBe("a");
    expect(pickHook([], null)).toBeNull();
  });

  it("pictures: all different while the library lasts, one picture when not per slide", () => {
    expect(new Set(pickImages(["1", "2", "3"], 3, true, () => 0.3)).size).toBe(3);
    expect(pickImages(["1", "2"], 5, true)).toHaveLength(5);
    expect(new Set(pickImages(["1", "2", "3"], 4, false, () => 0.5)).size).toBe(1);
    expect(pickImages([], 3, true)).toEqual([]);
  });

  it("writer: the prompt asks for the count and the JSON, and the answer is checked", () => {
    const spec = sanitizeSpec({ topic: "golf", content: { slides: 3, style: "numbered" }, cta: { text: "Get Scratch on the App Store", placement: "end" } });
    const p = writerPrompt(spec, "6 hacks", "a golf app", "Never invent a number.");
    expect(p.system).toContain("exactly 3 content slides");
    expect(p.system).toContain("Number the points");
    expect(p.system).toContain("Never invent a number.");
    expect(p.user).toContain("Hook (slide 1): 6 hacks");
    expect(parseWriter('{"slides":["a","b"],"cta":"x","caption":"c"}', spec)).toBeNull();
    expect(parseWriter("not json", spec)).toBeNull();
    const ok = parseWriter('```json\n{"slides":["a","b","c","d"],"cta":"","caption":"c #golf"}\n```', spec)!;
    expect(ok.slides).toEqual(["a", "b", "c"]);
    expect(ok.cta).toBe("Get Scratch on the App Store");
    expect(runPlan(spec, "6 hacks", ok).map((s) => s.role)).toEqual(["hook", "content", "content", "content", "cta"]);
    const none = sanitizeSpec({ content: { slides: 1 }, cta: { placement: "none" } });
    expect(runPlan(none, "h", parseWriter('{"slides":["a"],"cta":"x","caption":""}', none)!).map((s) => s.role)).toEqual(["hook", "content"]);
  });

  it("looks and overlays match the editor's maths", () => {
    expect(lookFilterSvg("none")).toBeNull();
    expect(lookFilterSvg("bw")).toContain('type="saturate" values="0"');
    expect(lookFilterSvg("vivid", 100)).toContain('values="1.8"');
    expect(overlayCss({ kind: "dim", strength: 35 })).toBe("rgba(0,0,0,0.35)");
    expect(overlayCss({ kind: "none", strength: 50 })).toBeNull();
    expect(overlayCss({ kind: "bottom", strength: 70 })).toMatch(/^linear-gradient\(to bottom, rgba\(0,0,0,0\) 35%/);
  });
});
