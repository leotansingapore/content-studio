import { describe, expect, it } from "vitest";
import { PEOPLE_RULE, tokenSecret } from "../ai-image/logic";
import { GLOBAL_COUNTER_USER, refundUsage, type UsageClient } from "../_shared/usageCaps";
import {
  MAX_SLICE, avatarCredits, creditsUsd, explainerCredits, parseVideoRequest, pictureBody, presenterBody, readMedia,
  refundFailed, refundTicket, speakBody, speakSeconds, validateScript,
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
    expect(speakBody("https://i", "https://a", 9.3, 7)).toMatchObject({
      params: { input_image: { type: "image_url", image_url: "https://i" }, input_audio: { type: "audio_url", audio_url: "https://a" }, quality: "mid", duration: 10, seed: 7 },
    });
    expect(speakBody("https://i", "https://a", 3, 7)).toMatchObject({ params: { duration: 5 } });
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
    // how Seedance said it on a template clip with a face photo, 2026-10-10 (not charged)
    const blocked = { status: "failed", error: "The generated result was blocked by content safety checks. Try a different prompt or reference media." };
    expect(readMedia(blocked)).toMatchObject({ state: "failed", error: expect.stringMatching(/safety filter/) });
    expect(readMedia({ status: "failed", error: "Generation failed" })).toEqual({ state: "failed", error: "It didn't come through. Try again." });
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

describe("a failed video gives its use back", () => {
  const DAY = "2026-10-10";
  const UID = "user-a";
  const IDS = ["11111111-2222-4333-8444-555555555555", "66666666-7777-4888-9999-aaaaaaaaaaaa"];
  const key = (u: string, f: string, d = DAY) => `${u}|${f}|${d}`;

  /** cs_ai_usage in memory: the consume RPC (on DAY), one row read and the conditional update. */
  function usageDb(start: Record<string, number> = {}) {
    const rows = new Map(Object.entries(start));
    const rowKey = (q: Record<string, unknown>) => key(String(q.user_id), String(q.feature), String(q.day));
    let beforeUpdate: (() => void) | null = null;
    const admin: UsageClient = {
      rpc: async (_fn, a) => {
        const k = key(String(a.p_user), String(a.p_feature));
        const n = rows.get(k) ?? 0;
        if (n >= Number(a.p_limit)) return { data: null, error: null };
        rows.set(k, n + 1);
        return { data: n + 1, error: null };
      },
      from: () => ({
        select: () => ({ match: async (q) => ({ data: rows.has(rowKey(q)) ? [{ count: rows.get(rowKey(q)) }] : [], error: null }) }),
        update: (v) => ({
          match: (q) => ({
            select: async () => {
              beforeUpdate?.();
              beforeUpdate = null;
              const hit = rows.get(rowKey(q)) === q.count;
              if (hit) rows.set(rowKey(q), Number(v.count));
              return { data: hit ? [{ count: v.count }] : [], error: null };
            },
          }),
        }),
      }),
    };
    return { admin, rows, raceOnce: (fn: () => void) => (beforeUpdate = fn) };
  }

  const spent = () => ({ [key(UID, "ai-video")]: 2, [key(GLOBAL_COUNTER_USER, "ai-video-global")]: 7 });

  it("gives back the adviser's use and the studio's when Higgsfield fails a job, once", async () => {
    const secret = await tokenSecret("service-role-key");
    const db = usageDb(spent());
    const ticket = await refundTicket(secret, UID, "ai-video", DAY, IDS);
    expect(await refundFailed(db.admin, secret, UID, IDS, true, ticket, DAY)).toBe(true);
    expect(db.rows.get(key(UID, "ai-video"))).toBe(1);
    expect(db.rows.get(key(GLOBAL_COUNTER_USER, "ai-video-global"))).toBe(6);
    // the browser asks again, or a second tab does
    expect(await refundFailed(db.admin, secret, UID, IDS, true, ticket, DAY)).toBe(false);
    expect(db.rows.get(key(UID, "ai-video"))).toBe(1);
    expect(db.rows.get(key(GLOBAL_COUNTER_USER, "ai-video-global"))).toBe(6);
  });

  it("gives nothing back for a video that worked", async () => {
    const secret = await tokenSecret("service-role-key");
    const db = usageDb(spent());
    const ticket = await refundTicket(secret, UID, "ai-video", DAY, IDS);
    expect(await refundFailed(db.admin, secret, UID, IDS, false, ticket, DAY)).toBe(false);
    expect(Object.fromEntries(db.rows)).toEqual(spent());
  });

  it("gives nothing back for a ticket from another day, person or video", async () => {
    const secret = await tokenSecret("service-role-key");
    const db = usageDb(spent());
    const ticket = await refundTicket(secret, UID, "ai-video", DAY, IDS);
    expect(await refundFailed(db.admin, secret, UID, IDS, true, ticket, "2026-10-11")).toBe(false);
    expect(await refundFailed(db.admin, secret, "user-b", IDS, true, ticket, DAY)).toBe(false);
    expect(await refundFailed(db.admin, secret, UID, IDS.slice(1), true, ticket, DAY)).toBe(false);
    expect(await refundFailed(db.admin, secret, UID, IDS, true, undefined, DAY)).toBe(false);
    expect(Object.fromEntries(db.rows)).toEqual(spent());
  });

  it("gives a template clip's use back on its own caps", async () => {
    const secret = await tokenSecret("service-role-key");
    const db = usageDb({ [key(UID, "ai-clip")]: 1, [key(GLOBAL_COUNTER_USER, "ai-clip-global")]: 3, ...spent() });
    const ticket = await refundTicket(secret, UID, "ai-clip", DAY, IDS.slice(0, 1));
    expect(await refundFailed(db.admin, secret, UID, IDS.slice(0, 1), true, ticket, DAY)).toBe(true);
    expect(db.rows.get(key(UID, "ai-clip"))).toBe(0);
    expect(db.rows.get(key(GLOBAL_COUNTER_USER, "ai-clip-global"))).toBe(2);
    expect(db.rows.get(key(UID, "ai-video"))).toBe(2);
  });

  it("never goes below zero, and reads again when another call moved the count", async () => {
    const db = usageDb({ [key(UID, "ai-video")]: 0, [key(UID, "ai-clip")]: 2 });
    expect(await refundUsage(db.admin, UID, "ai-video", DAY)).toBe(false);
    expect(await refundUsage(db.admin, UID, "ai-image", DAY)).toBe(false);
    db.raceOnce(() => db.rows.set(key(UID, "ai-clip"), 3)); // another video started in between
    expect(await refundUsage(db.admin, UID, "ai-clip", DAY)).toBe(true);
    expect(db.rows.get(key(UID, "ai-clip"))).toBe(2);
  });

  it("takes the ticket along on a status check", () => {
    expect(parseVideoRequest({ mode: "status", tokens: ["t"], refund: "r.x" })).toEqual({ ok: true, request: { mode: "status", tokens: ["t"], refund: "r.x" } });
    expect(parseVideoRequest({ mode: "status", tokens: ["t"], refund: 5 })).toEqual({ ok: true, request: { mode: "status", tokens: ["t"] } });
  });
});
