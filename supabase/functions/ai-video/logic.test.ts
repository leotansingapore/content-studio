import { describe, expect, it } from "vitest";
import { PEOPLE_RULE } from "../ai-image/logic";
import {
  MAX_SLICE, avatarCredits, creditsUsd, explainerCredits, parseVideoRequest, pictureBody, presenterBody, readMedia,
  speakBody, speakSeconds, validateScript,
} from "./logic";

const WAV = "UklGRiQAAABXQVZFZm10IBAAAAABAAEA";
const JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD";

describe("costs", () => {
  it("bills each slice as Speak's 5 or 10 seconds at 2.2 credits a second", () => {
    expect(speakSeconds(4.5)).toBe(5);
    expect(speakSeconds(4.6)).toBe(10);
    expect(avatarCredits([9.4, 9.1, 3.2])).toBe(55);
    expect(avatarCredits([MAX_SLICE, MAX_SLICE, MAX_SLICE, 1.5])).toBe(77);
    expect(creditsUsd(88)).toBeCloseTo(5.5);
  });

  it("prices an explainer by its pictures", () => {
    expect(explainerCredits(5)).toBe(0.45);
    expect(explainerCredits(6)).toBe(0.54);
  });
});

describe("parseVideoRequest", () => {
  it("takes an avatar video from a photo or a presenter link and WAV slices", () => {
    expect(parseVideoRequest({ mode: "avatar", photo: { jpeg: JPEG }, slices: [{ wav: WAV, seconds: 9.2 }, { wav: WAV, seconds: 3 }] })).toEqual({
      ok: true,
      request: { mode: "avatar", photo: { jpeg: JPEG }, slices: [{ wav: WAV, seconds: 9.2 }, { wav: WAV, seconds: 3 }] },
    });
    expect(parseVideoRequest({ mode: "avatar", photo: { url: "https://d3u0tzju9qaucj.cloudfront.net/a/b.png" }, slices: [{ wav: WAV, seconds: 5 }] })).toMatchObject({ ok: true });
  });

  it("refuses an avatar video that would bill more than it should", () => {
    const slice = { wav: WAV, seconds: 9 };
    expect(parseVideoRequest({ mode: "avatar", photo: { jpeg: JPEG }, slices: [slice, slice, slice, slice, slice] })).toMatchObject({ ok: false });
    expect(parseVideoRequest({ mode: "avatar", photo: { jpeg: JPEG }, slices: Array(5).fill({ wav: WAV, seconds: 3 }) })).toMatchObject({ ok: false });
    expect(parseVideoRequest({ mode: "avatar", photo: { jpeg: JPEG }, slices: [slice, slice, slice, { wav: WAV, seconds: 9.5 }] })).toMatchObject({ ok: false });
    expect(parseVideoRequest({ mode: "avatar", photo: { jpeg: JPEG }, slices: [{ wav: WAV, seconds: 12 }] })).toMatchObject({ ok: false });
    expect(parseVideoRequest({ mode: "avatar", photo: { jpeg: JPEG }, slices: [] })).toMatchObject({ ok: false });
  });

  it("refuses files that aren't a WAV or a JPEG, and links that aren't https", () => {
    expect(parseVideoRequest({ mode: "avatar", photo: { jpeg: "iVBORw0KGgo" }, slices: [{ wav: WAV, seconds: 3 }] })).toMatchObject({ ok: false });
    expect(parseVideoRequest({ mode: "avatar", photo: { jpeg: JPEG }, slices: [{ wav: "SUQzBAAAAAAA", seconds: 3 }] })).toMatchObject({ ok: false });
    expect(parseVideoRequest({ mode: "avatar", photo: { jpeg: JPEG }, slices: [{ wav: `${WAV}<script>`, seconds: 3 }] })).toMatchObject({ ok: false });
    expect(parseVideoRequest({ mode: "avatar", photo: { url: "http://x.example/a.png" }, slices: [{ wav: WAV, seconds: 3 }] })).toMatchObject({ ok: false });
  });

  it("checks topics, looks, scenes and status tokens", () => {
    expect(parseVideoRequest({ mode: "script", topic: "  Why  hospital plans have a co-pay " })).toEqual({ ok: true, request: { mode: "script", topic: "Why hospital plans have a co-pay" } });
    expect(parseVideoRequest({ mode: "script", topic: "x".repeat(201) })).toMatchObject({ ok: false });
    expect(parseVideoRequest({ mode: "presenter", look: "short" })).toMatchObject({ ok: false });
    expect(parseVideoRequest({ mode: "explainer", pictures: ["A couple at an HDB table", "A father with his son"] })).toMatchObject({ ok: false });
    expect(parseVideoRequest({ mode: "explainer", pictures: Array(7).fill("A couple at an HDB table") })).toMatchObject({ ok: false });
    expect(parseVideoRequest({ mode: "explainer", pictures: Array(4).fill("A couple at an HDB table") })).toMatchObject({ ok: true });
    expect(parseVideoRequest({ mode: "status", tokens: ["a.b"] })).toEqual({ ok: true, request: { mode: "status", tokens: ["a.b"] } });
    expect(parseVideoRequest({ mode: "status", tokens: [] })).toMatchObject({ ok: false });
    expect(parseVideoRequest({ mode: "status", tokens: Array(7).fill("a.b") })).toMatchObject({ ok: false });
    expect(parseVideoRequest({ mode: "anything" })).toMatchObject({ ok: false });
  });
});

describe("Higgsfield bodies", () => {
  it("asks Speak for mid quality at the slice's billed length", () => {
    expect(speakBody("https://i", "https://a", 9.3, 7)).toMatchObject({ image_url: "https://i", audio_url: "https://a", quality: "mid", duration: 10, seed: 7 });
    expect(speakBody("https://i", "https://a", 3, 7)).toMatchObject({ duration: 5 });
  });

  it("makes 9:16 pictures, with the people rule on every scene", () => {
    expect(presenterBody("A Malay Singaporean woman in her 30s")).toMatchObject({ aspect_ratio: "9:16", resolution: "1080p", batch_size: 1 });
    expect(String(presenterBody("A Malay Singaporean woman in her 30s").prompt)).toMatch(/^A Malay Singaporean woman in her 30s\n\n.*no other people/s);
    expect(pictureBody("A couple at an HDB table")).toEqual({ prompt: `A couple at an HDB table\n\n${PEOPLE_RULE}`, aspect_ratio: "9:16", resolution: "1080p", batch_size: 1 });
  });

  it("reads a finished video or picture, and never calls a job done without an https link", () => {
    expect(readMedia({ status: "in_progress" })).toEqual({ state: "working" });
    expect(readMedia({ status: "completed", video: { url: "https://cdn/v.mp4" } })).toEqual({ state: "done", url: "https://cdn/v.mp4" });
    expect(readMedia({ status: "completed", images: [{ url: "https://cdn/p.png" }] })).toEqual({ state: "done", url: "https://cdn/p.png" });
    expect(readMedia({ status: "completed", video: { url: "javascript:alert(1)" } })).toMatchObject({ state: "failed" });
    expect(readMedia({ status: "nsfw" })).toMatchObject({ state: "failed", error: expect.stringMatching(/safety filter/) });
    expect(readMedia(null)).toMatchObject({ state: "failed" });
  });
});

describe("validateScript", () => {
  const scene = { say: "Your hospital plan has a co-pay.", picture: "A Chinese Singaporean man in his 40s reading a letter at home" };

  it("keeps 3 to 6 tidy scenes and drops ones with no picture", () => {
    expect(validateScript(JSON.stringify({ scenes: [scene, scene, { say: "Hi", picture: "" }, scene] }))).toHaveLength(3);
    expect(validateScript({ scenes: [{ ...scene, say: "  It   costs\u2014more " }, scene, scene] })?.[0].say).toBe("It costs, more");
  });

  it("refuses too few or too many scenes, a long script and junk", () => {
    expect(validateScript({ scenes: [scene, scene] })).toBeNull();
    expect(validateScript({ scenes: Array(7).fill(scene) })).toBeNull();
    expect(validateScript({ scenes: Array(4).fill({ ...scene, say: "word ".repeat(30) }) })).toBeNull();
    expect(validateScript("not json")).toBeNull();
  });
});
