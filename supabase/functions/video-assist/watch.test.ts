import { describe, expect, it } from "vitest";
import { fileSeconds, mergeWatches, readWatchReply, watchSeconds, watchType, watchVideo, type WatchFinding } from "./watch";

const reply = (duration: number, findings: unknown[]) => JSON.stringify({ duration_sec: duration, screen_text: ["PULL THROUGH"], findings });
const covered = { kind: "covered", start: 35.8, end: 37.4, seen: "The 1% bar sits over the PULL THROUGH label.", fix: "Put the label under the bar." };

describe("readWatchReply", () => {
  it("keeps findings when the length matches", () => {
    expect(readWatchReply(reply(37.7, [covered]), 37.9)).toEqual([
      { kind: "covered", start: 35.8, end: 37.4, what: "The 1% bar sits over the PULL THROUGH label.", fix: "Put the label under the bar." },
    ]);
  });
  it("throws the watch away when the length is wrong or the reply is not JSON", () => {
    expect(readWatchReply(reply(12, [covered]), 37.9)).toBeNull();
    expect(readWatchReply("{\"findings\": [", 37.9)).toBeNull();
    // 5% of a longer video is more than 3 s
    expect(readWatchReply(reply(86, []), 90)).toEqual([]);
  });
  it("drops unknown kinds and empty findings, and holds times inside the video", () => {
    const got = readWatchReply(reply(30, [{ ...covered, kind: "boring" }, { ...covered, seen: " " }, { ...covered, start: -2, end: 99 }]), 30);
    expect(got).toEqual([{ ...readWatchReply(reply(30, [covered]), 30)![0], start: 0, end: 30 }]);
  });
});

describe("mergeWatches", () => {
  const f = (kind: WatchFinding["kind"], start: number, end: number): WatchFinding => ({ kind, start, end, what: `${kind} ${start}`, fix: "" });
  it("keeps one of each moment both watches saw, and what only one saw, in time order", () => {
    expect(mergeWatches([[f("mismatch", 20.8, 22.5), f("covered", 35.8, 37.4)], [f("mismatch", 20.6, 22.8), f("covered", 5, 6)]])).toEqual([
      f("covered", 5, 6),
      f("mismatch", 20.8, 22.5),
      f("covered", 35.8, 37.4),
    ]);
  });
  it("keeps two kinds at the same moment apart", () => {
    expect(mergeWatches([[f("covered", 4, 5)], [f("sound", 4, 5)]])).toHaveLength(2);
  });
  it("is null only when no watch could be read", () => {
    expect(mergeWatches([null, null])).toBeNull();
    expect(mergeWatches([null, []])).toEqual([]);
  });
});

describe("request checks", () => {
  it("takes the video types Gemini watches, codecs dropped", () => {
    expect(watchType("video/webm;codecs=vp9,opus")).toBe("video/webm");
    expect(watchType("audio/wav")).toBeNull();
    expect(watchType(null)).toBeNull();
  });
  it("takes lengths up to 90 seconds", () => {
    expect(watchSeconds("37.9")).toBe(37.9);
    expect(watchSeconds("91")).toBeNull();
    expect(watchSeconds(null)).toBeNull();
  });
});

describe("fileSeconds", () => {
  it("reads Gemini's measure of the file", () => {
    expect(fileSeconds({ videoDuration: "152s" })).toBe(152);
    expect(fileSeconds({ videoDuration: "37.9s" })).toBe(37.9);
    expect(fileSeconds(undefined)).toBeNull();
  });
});

describe("watchVideo", () => {
  function fakeGemini(answers: (string | number | "hang")[], meta?: { videoDuration: string }) {
    const calls: string[] = [];
    const bodies: string[] = [];
    let polls = 0;
    const fetch = (async (url: string, init?: RequestInit) => {
      const u = String(url);
      calls.push(`${init?.method ?? "GET"} ${u.replace(/^https:\/\/[^/]+/, "")}`);
      if (u.endsWith("/upload/v1beta/files")) return new Response("", { headers: { "x-goog-upload-url": "https://up.example/session" } });
      if (u === "https://up.example/session") return Response.json({ file: { name: "files/abc", uri: "https://g/files/abc", state: "PROCESSING" } });
      if (u.endsWith("/files/abc") && init?.method === "DELETE") return new Response("{}");
      if (u.endsWith("/files/abc")) return Response.json(++polls > 1 ? { state: "ACTIVE", videoMetadata: meta } : { state: "PROCESSING" });
      bodies.push(String(init?.body));
      const a = answers.shift();
      if (a === "hang") return new Promise<Response>((_, no) => init?.signal?.addEventListener("abort", () => no(new Error("aborted"))));
      if (typeof a === "number") return Response.json({ error: { code: a } }, { status: a });
      return Response.json({ candidates: [{ content: { parts: [{ text: "thinking", thought: true }, { text: a }] } }] });
    }) as typeof globalThis.fetch;
    return { fetch, calls, bodies };
  }
  const deps = (fetch: typeof globalThis.fetch) => ({ fetch, sleep: async () => {}, graceMs: 10 });
  const file = () => new Blob(["0123456789"]);

  it("uploads, waits until it can be watched, watches twice, merges and deletes the file", async () => {
    const g = fakeGemini([reply(38, [covered]), reply(38, [{ ...covered, kind: "mismatch", start: 20, end: 22 }])]);
    const got = await watchVideo(file(), 10, "video/mp4", 38, "k", deps(g.fetch));
    expect(got !== "too-long" && got?.map((x) => x.kind)).toEqual(["mismatch", "covered"]);
    expect(g.calls.filter((c) => c.includes(":generateContent"))).toHaveLength(2);
    // Gemini watches 90 s at most, whatever the file runs
    expect(JSON.parse(g.bodies[0]).contents[0].parts[0].video_metadata).toEqual({ end_offset: "90s" });
    expect(g.calls.at(-1)).toBe("DELETE /v1beta/files/abc");
  });
  it("still answers when one watch fails, and is null when both do, deleting the file either way", async () => {
    const one = fakeGemini([500, reply(38, [covered])]);
    expect(await watchVideo(file(), 10, "video/mp4", 38, "k", deps(one.fetch))).toHaveLength(1);
    const none = fakeGemini([500, reply(5, [covered])]);
    expect(await watchVideo(file(), 10, "video/mp4", 38, "k", deps(none.fetch))).toBeNull();
    expect(none.calls.at(-1)).toBe("DELETE /v1beta/files/abc");
  });
  it("refuses a file Gemini measures over 90 s before paying for a watch, whatever length was sent", async () => {
    const g = fakeGemini([reply(152, [])], { videoDuration: "152s" });
    expect(await watchVideo(file(), 10, "video/mp4", 30, "k", deps(g.fetch))).toBe("too-long");
    expect(g.calls.some((c) => c.includes(":generateContent"))).toBe(false);
    expect(g.calls.at(-1)).toBe("DELETE /v1beta/files/abc");
  });
  it("checks the reply against Gemini's measure, not the length the browser sent", async () => {
    const g = fakeGemini([reply(60, [covered]), reply(60, [])], { videoDuration: "60s" });
    expect(await watchVideo(file(), 10, "video/mp4", 30, "k", deps(g.fetch))).toHaveLength(1);
  });
  it("stops waiting for a slow watch once the other is back", async () => {
    const g = fakeGemini([reply(38, [covered]), "hang"]);
    expect(await watchVideo(file(), 10, "video/mp4", 38, "k", deps(g.fetch))).toHaveLength(1);
  });
});
