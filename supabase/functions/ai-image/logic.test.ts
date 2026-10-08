import { describe, expect, it } from "vitest";
import { PEOPLE_RULE, buildImageBody, parseImageRequest, readStatus } from "./logic";

describe("parseImageRequest", () => {
  it("starts a job from a tidied prompt", () => {
    expect(parseImageRequest({ mode: "start", prompt: "  A couple   at an HDB dining table  " })).toEqual({
      ok: true,
      request: { mode: "start", prompt: "A couple at an HDB dining table" },
    });
    expect(parseImageRequest({ prompt: "A couple at an HDB dining table" })).toMatchObject({ ok: true, request: { mode: "start" } });
  });

  it("refuses a short or overlong prompt and a status id that isn't a UUID", () => {
    expect(parseImageRequest({ prompt: "cat" })).toMatchObject({ ok: false });
    expect(parseImageRequest({ prompt: "x".repeat(1201) })).toMatchObject({ ok: false });
    expect(parseImageRequest({ mode: "status", id: "../balance" })).toMatchObject({ ok: false });
    expect(parseImageRequest({ mode: "status", id: "4CAA5951-46AE-4D65-9F8F-7B05DD4207CB" })).toEqual({
      ok: true,
      request: { mode: "status", id: "4caa5951-46ae-4d65-9f8f-7b05dd4207cb" },
    });
  });
});

describe("buildImageBody", () => {
  it("adds the Singapore people rule and asks for one 3:4 1080p picture", () => {
    const body = buildImageBody("A couple at an HDB dining table");
    expect(body).toMatchObject({ aspect_ratio: "3:4", resolution: "1080p", batch_size: 1 });
    expect(body.prompt).toBe(`A couple at an HDB dining table\n\n${PEOPLE_RULE}`);
    expect(PEOPLE_RULE).toMatch(/Singapore/);
    expect(PEOPLE_RULE).toMatch(/clearly different from the others/);
  });
});

describe("readStatus", () => {
  it("maps Higgsfield's states", () => {
    expect(readStatus({ status: "queued" })).toEqual({ state: "working" });
    expect(readStatus({ status: "in_progress" })).toEqual({ state: "working" });
    expect(readStatus({ status: "completed", images: [{ url: "https://d3u0tzju9qaucj.cloudfront.net/a/b.png" }] })).toEqual({
      state: "done",
      url: "https://d3u0tzju9qaucj.cloudfront.net/a/b.png",
    });
    expect(readStatus({ status: "nsfw" })).toMatchObject({ state: "failed", error: expect.stringMatching(/safety filter/) });
    expect(readStatus({ status: "failed" })).toMatchObject({ state: "failed" });
    expect(readStatus(null)).toMatchObject({ state: "failed" });
  });

  it("never calls a job done without an https picture", () => {
    expect(readStatus({ status: "completed", images: [] })).toMatchObject({ state: "failed" });
    expect(readStatus({ status: "completed", images: [{ url: "javascript:alert(1)" }] })).toMatchObject({ state: "failed" });
  });
});
