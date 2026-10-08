import { describe, expect, it } from "vitest";
import { CLIP_SECONDS, aiBrollEnabled, motionBody, parseAiBroll, scenePictureBody } from "./broll";
import { PEOPLE_RULE, readStatus } from "./logic";
import { DAILY_LIMITS } from "../_shared/usageCaps";

describe("an AI B-roll clip", () => {
  it("takes the search, the line and the video's shape, tidied", () => {
    expect(parseAiBroll({ mode: "broll", search: "  family   dinner ", line: "We eat  together.", aspect: "16:9" })).toEqual({ ok: true, request: { search: "family dinner", line: "We eat together.", aspect: "16:9" } });
    expect(parseAiBroll({ search: "family dinner", aspect: "4:5" })).toMatchObject({ ok: true, request: { aspect: "9:16", line: "" } });
    expect(parseAiBroll({ search: "x" })).toMatchObject({ ok: false });
  });
  it("asks for one 720p picture in the video's shape, with the people rule and the line as context", () => {
    const body = scenePictureBody({ search: "family dinner", line: 'She said "eat"', aspect: "9:16" });
    expect(body).toMatchObject({ aspect_ratio: "9:16", resolution: "720p", batch_size: 1 });
    expect(body.prompt).toBe(`A realistic photo of family dinner, as B-roll in a short video. It shows while someone says: "She said 'eat'"\n\n${PEOPLE_RULE}`);
  });
  it("moves the picture for 5 s", () => {
    expect(motionBody("https://cdn.example/p.png")).toMatchObject({ image_url: "https://cdn.example/p.png", duration: CLIP_SECONDS });
  });
  it("reads a finished clip's video link as done", () => {
    expect(readStatus({ status: "completed", video: { url: "https://cdn.example/c.mp4" } })).toEqual({ state: "done", url: "https://cdn.example/c.mp4" });
    expect(readStatus({ status: "completed", video: { url: "http://cdn.example/c.mp4" } })).toMatchObject({ state: "failed" });
  });
  it("is capped at 3 a day per adviser and 20 across everyone", () => {
    expect(DAILY_LIMITS["ai-broll"]).toBe(3);
    expect(DAILY_LIMITS["ai-broll-global"]).toBe(20);
  });
});

describe("the server switch for AI B-roll", () => {
  it("is on only when the secret is exactly 1", () => {
    expect(aiBrollEnabled("1")).toBe(true);
    expect(aiBrollEnabled(" 1 ")).toBe(true);
    for (const v of [undefined, "", "0", "true", "yes", "11"]) expect(aiBrollEnabled(v)).toBe(false);
  });
});
