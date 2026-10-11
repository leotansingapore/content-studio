import { describe, expect, it } from "vitest";
import { PEOPLE_RULE, buildFixBody, buildImageBody, pictureUrl, jobToken, openJobToken, parseImageRequest, readStatus, tokenSecret } from "./logic";

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
    expect(parseImageRequest({ mode: "status" })).toMatchObject({ ok: false });
    expect(parseImageRequest({ mode: "status", token: "x".repeat(121) })).toMatchObject({ ok: false });
    expect(parseImageRequest({ mode: "status", token: "abc.def" })).toEqual({ ok: true, request: { mode: "status", token: "abc.def" } });
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

describe("job tokens", () => {
  const id = "4caa5951-46ae-4d65-9f8f-7b05dd4207cb";

  it("opens only for the adviser it was made for", async () => {
    const secret = await tokenSecret("service-role-key");
    const forA = await jobToken(secret, "user-a", id.toUpperCase());
    expect(forA.startsWith(`${id}.`)).toBe(true);
    expect(await openJobToken(secret, "user-a", forA)).toBe(id);
    expect(await openJobToken(secret, "user-b", forA)).toBeNull();
  });

  it("refuses a bare id, a tampered signature and another server's token", async () => {
    const secret = await tokenSecret("service-role-key");
    const forA = await jobToken(secret, "user-a", id);
    expect(await openJobToken(secret, "user-a", id)).toBeNull();
    expect(await openJobToken(secret, "user-a", `${forA.slice(0, -1)}${forA.endsWith("0") ? "1" : "0"}`)).toBeNull();
    const other = await jobToken(await tokenSecret("another-key"), "user-a", id);
    expect(await openJobToken(secret, "user-a", other)).toBeNull();
  });
});

describe("fix mode", () => {
  it("takes a token and a tidied fix, and refuses a missing, short or long one", () => {
    expect(parseImageRequest({ mode: "fix", token: "abc.def", fix: "  remove the   text on the sign " })).toEqual({
      ok: true,
      request: { mode: "fix", token: "abc.def", fix: "remove the text on the sign" },
    });
    expect(parseImageRequest({ mode: "fix", fix: "remove the text" })).toMatchObject({ ok: false });
    expect(parseImageRequest({ mode: "fix", token: "abc.def", fix: "no" })).toMatchObject({ ok: false });
    expect(parseImageRequest({ mode: "fix", token: "abc.def", fix: "x".repeat(301) })).toMatchObject({ ok: false });
  });

  it("edits the one picture at 3:4 and keeps the rest", () => {
    const body = buildFixBody("https://cdn.example/a.png", "fix the hands");
    expect(body).toMatchObject({ image_urls: ["https://cdn.example/a.png"], aspect_ratio: "3:4", resolution: "2k" });
    expect(String(body.prompt)).toMatch(/^fix the hands\n\nChange only what is asked/);
  });

  it("only a finished picture can be fixed, never a B-roll video", () => {
    expect(pictureUrl({ status: "completed", images: [{ url: "https://cdn.example/a.png" }] })).toBe("https://cdn.example/a.png");
    expect(pictureUrl({ status: "completed", video: { url: "https://cdn.example/a.mp4" } })).toBeNull();
    expect(pictureUrl({ status: "in_progress" })).toBeNull();
    expect(pictureUrl({ status: "completed", images: [{ url: "http://cdn.example/a.png" }] })).toBeNull();
  });
});
