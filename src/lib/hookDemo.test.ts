import { describe, expect, it } from "vitest";
import { DEMO_BAD, HOOK_CLIP_LENGTH, SIDEWAYS, SPOKEN_TOO_LONG, clock, demoIssue, hookClipIssue, hookIssue, joinPlan } from "./hookDemo";

const MB = 1024 * 1024;
const file = (type: string, size = 20 * MB, name = "screen-recording.mp4") => ({ type, size, name });

describe("the demo", () => {
  it("takes an MP4 or MOV up to 100 MB and 30 seconds", () => {
    expect(demoIssue(file("video/mp4"), 24)).toBeNull();
    expect(demoIssue(file("video/quicktime", 99 * MB, "demo.mov"), 30)).toBeNull();
    // a header that reads a 30 s recording as 30.4 s is still 30 s
    expect(demoIssue(file("video/mp4"), 30.4)).toBeNull();
    // some browsers give no type for a .mov: its name says what it is
    expect(demoIssue(file("", 10 * MB, "demo.MOV"), 12)).toBeNull();
  });

  it("refuses a wrong type, over 100 MB, over 30 s, and one whose length can't be read", () => {
    expect(demoIssue(file("video/webm", 10 * MB, "demo.webm"), 12)).toBe(DEMO_BAD);
    expect(demoIssue(file("image/png", MB, "shot.png"), 12)).toBe(DEMO_BAD);
    expect(demoIssue(file("", MB, "demo.avi"), 12)).toBe(DEMO_BAD);
    expect(demoIssue(file("video/mp4", 101 * MB), 12)).toBe(DEMO_BAD);
    expect(demoIssue(file("video/mp4"), 31)).toBe(DEMO_BAD);
    expect(demoIssue(file("video/mp4"), NaN)).toBe(DEMO_BAD);
    expect(DEMO_BAD).toBe("Use an MP4 or MOV under 100 MB and 30 seconds.");
  });
});

describe("your own hook clip", () => {
  it("takes an upright clip of 2 to 5 seconds", () => {
    expect(hookClipIssue(1080, 1920, 3)).toBeNull();
    expect(hookClipIssue(720, 1280, 2)).toBeNull();
    expect(hookClipIssue(1080, 1080, 5)).toBeNull();
  });

  it("refuses a sideways clip first, then one outside 2 to 5 seconds", () => {
    expect(hookClipIssue(1920, 1080, 3)).toBe(SIDEWAYS);
    expect(hookClipIssue(1920, 1080, 9)).toBe(SIDEWAYS);
    expect(hookClipIssue(0, 0, 3)).toBe(SIDEWAYS);
    expect(hookClipIssue(1080, 1920, 1.5)).toBe(HOOK_CLIP_LENGTH);
    expect(hookClipIssue(1080, 1920, 6)).toBe(HOOK_CLIP_LENGTH);
    expect(SIDEWAYS).toBe("Use an upright clip for the hook, so the video stays vertical.");
  });
});

describe("the hook", () => {
  it("needs one, and keeps someone saying it to 8 words", () => {
    expect(hookIssue("  ", "stock")).toBe("Pick a hook or type your own.");
    expect(hookIssue("Stop guessing why your pipeline is empty", "spoken")).toBeNull();
    expect(hookIssue("I logged every call for 30 days and here is what changed", "spoken")).toBe(SPOKEN_TOO_LONG);
    expect(hookIssue("I logged every call for 30 days and here is what changed", "stock")).toBeNull();
    expect(SPOKEN_TOO_LONG).toBe("Keep it to 8 words, so it fits in 4 seconds.");
  });
});

describe("the join", () => {
  it("puts the hook first and the demo after, with the hook's words from 0 to the hook's end", () => {
    expect(joinPlan("stock", 12, 24)).toEqual({ takes: [{ take: "hook", start: 0, end: 3 }, { take: "demo", start: 0, end: 24 }], overlay: { from: 0, to: 3 } });
    expect(joinPlan("spoken", 4, 20)).toEqual({ takes: [{ take: "hook", start: 0, end: 4 }, { take: "demo", start: 0, end: 20 }], overlay: { from: 0, to: 4 } });
    // your own clip runs whole
    expect(joinPlan("mine", 3.4, 20).takes[0].end).toBe(3.4);
    expect(joinPlan("mine", 3.4, 20).overlay.to).toBe(3.4);
  });

  it("cuts the demo at 30 s and a short stock clip at its own end", () => {
    expect(joinPlan("stock", 12, 30.4).takes[1].end).toBe(30);
    expect(joinPlan("stock", 2.6, 10).takes[0].end).toBe(2.6);
    expect(joinPlan("spoken", 4, 45).takes[1]).toEqual({ take: "demo", start: 0, end: 30 });
  });

  it("plays a saved demo's window: from its start in the file, for its length, never past 30 s", () => {
    // the 0:20 to 0:50 window of a 2-minute recording
    expect(joinPlan("stock", 12, 30, 20)).toEqual({ takes: [{ take: "hook", start: 0, end: 3 }, { take: "demo", start: 20, end: 50 }], overlay: { from: 0, to: 3 } });
    expect(joinPlan("spoken", 4, 12.5, 61.25).takes[1]).toEqual({ take: "demo", start: 61.25, end: 73.75 });
    expect(joinPlan("stock", 12, 45, 10).takes[1]).toEqual({ take: "demo", start: 10, end: 40 });
    expect(joinPlan("stock", 12, 24, -3).takes[1]).toEqual({ take: "demo", start: 0, end: 24 });
  });

  it("shows the demo's length as a clock", () => {
    expect(clock(24)).toBe("0:24");
    expect(clock(59.6)).toBe("1:00");
    expect(clock(5)).toBe("0:05");
  });
});
