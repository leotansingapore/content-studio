import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  LOAD_TIMEOUT_MS, MAX_ANSWER_BYTES, PACE_MS, PAUSE_MS, Paused, cleanHandle, createReader, embedOf, fit, gridOf, handlesOf, readCreators, readReel, readReels, takenAtOf,
  waitWords, wallOf,
} from "./instagram.mjs";

// Made-up pages in the shapes Instagram's logged-out pages carry their data in: JSON in script tags for the grid, a
// contextJSON string for the embed page. Every name and number here is invented.
const PK = "39750000000000001";
const node = (code, plays, extra = {}) => ({ node: { pk: "3998349893411785154", code, play_count: plays, like_count: Math.round(plays / 30), comment_count: 12, display_uri: `https://scontent.cdninstagram.com/${code}.jpg`, clips_tab_pinned_user_ids: [], ...extra } });
const gridHtml = (user, edges) =>
  `<html><script type="application/json" data-sjs>{"require":[["x",null,null,[{"__bbox":{"result":{"data":{"xig_user_by_username":${JSON.stringify({ ...user, polaris_clips_connection: { edges } })}}}}}]]]}</script>` +
  `<script type="application/json">{not json}</script></html>`;
const USER = { pk: PK, username: "made.up_creator", full_name: "Made Up", follower_count: 120400, biography: "money tips", profile_pic_url: "https://scontent.cdninstagram.com/a.jpg", is_private: false };
const embedHtml = (code, caption) => {
  const ctx = JSON.stringify({ gql_data: { shortcode_media: { id: "3998349893411785154", shortcode: code, video_view_count: 4000, edge_liked_by: { count: 300 }, edge_media_to_comment: { count: 9 }, owner: { username: "made.up_creator" }, edge_media_to_caption: { edges: [{ node: { text: caption } }] }, video_url: "https://instagram.fsin1-1.fna.fbcdn.net/v.mp4", thumbnail_src: "https://scontent.cdninstagram.com/t.jpg" } } });
  return `<script>x({"contextJSON":${JSON.stringify(ctx)}})</script>`;
};

describe("reading Instagram's pages", () => {
  it("finds the profile and the reels on a grid page, pinned ones marked, dated from their ids", () => {
    const g = gridOf(gridHtml(USER, [node("DPinned0001", 900000, { clips_tab_pinned_user_ids: [PK] }), node("DMadeUp0001", 51000), node("DMadeUp0001", 1)]), "made.up_creator");
    expect(g.profile).toEqual({ handle: "made.up_creator", name: "Made Up", followers: 120400, posts: null, avatar: "https://scontent.cdninstagram.com/a.jpg", bio: "money tips" });
    expect(g.reels.map((r) => [r.code, r.views, r.pinned])).toEqual([["DPinned0001", 900000, true], ["DMadeUp0001", 51000, false]]);
    expect(g.reels[1]).toMatchObject({ likes: 1700, comments: 12, takenAt: "2026-10-01T13:14:31.890Z", url: "https://www.instagram.com/reel/DMadeUp0001/" });
    expect(gridOf(gridHtml(USER, []), "someone.else")).toBeNull();
    expect(gridOf("<html>nothing</html>", "made.up_creator")).toBeNull();
  });

  it("reads a reel's caption, video and numbers from its embed page", () => {
    expect(embedOf(embedHtml("DMadeUp0001", "Open your receipts every Monday."))).toMatchObject({
      code: "DMadeUp0001", owner: "made.up_creator", views: 4000, likes: 300, comments: 9, caption: "Open your receipts every Monday.", video: "https://instagram.fsin1-1.fna.fbcdn.net/v.mp4",
    });
    expect(embedOf("<html></html>")).toBeNull();
  });

  it("knows a login wall, a challenge and a 429, and never a username or a caption, for one", () => {
    expect(wallOf({ url: "https://www.instagram.com/accounts/login/?next=%2Fx%2F" })).toBe("login");
    expect(wallOf({ url: "https://www.instagram.com/challenge/?x" })).toBe("login");
    expect(wallOf({ url: "https://www.instagram.com/x/reels/", status: 429 })).toBe("wait");
    expect(wallOf({ url: "https://www.instagram.com/challenge.daily/reels/" })).toBeNull();
    expect(wallOf({ url: "https://www.instagram.com/x/reels/", body: "Please wait a few minutes before you try again." })).toBeNull();
    expect(waitWords("Please wait a few minutes before you try again.")).toBe(true);
    expect(waitWords("Missed it? Try again later this week.")).toBe(false);
    expect([cleanHandle("challenge"), cleanHandle("challenge.daily")]).toEqual([null, "challenge.daily"]);
    expect(takenAtOf("nope")).toBeNull();
  });

  it("takes a search's usernames from its JSON, else from @names and links, and never a made-up shape", () => {
    expect(handlesOf('```json\n{"creators":[{"handle":"@Made.Up_Creator","why":"money tips"},{"handle":"bad name!"},{"handle":"made.up_creator"}]}\n```', 6)).toEqual([{ handle: "made.up_creator", why: "money tips" }]);
    expect(handlesOf("Try @second.one and https://www.instagram.com/third_one/ or instagram.com/reel/x", 6).map((h) => h.handle)).toEqual(["second.one", "third_one"]);
    expect(handlesOf('{"creators":[{"handle":"a1"},{"handle":"b2"},{"handle":"c3"}]}', 2).map((h) => h.handle)).toEqual(["a1", "b2"]);
  });

  it("clips an answer until it fits: captions, then videos, then covers", () => {
    const reels = Array.from({ length: 12 }, (_, i) => ({ code: `DMadeUp00${String(i).padStart(2, "0")}`, caption: "c".repeat(500), video: "v".repeat(3000), thumb: "t".repeat(2000) }));
    const a = fit({ profile: {}, reels });
    expect(Buffer.byteLength(JSON.stringify(a))).toBeLessThanOrEqual(MAX_ANSWER_BYTES);
    expect([a.reels[0].caption.length, a.reels[0].video, a.reels[0].thumb.length]).toEqual([150, "", 2000]);
    const small = fit({ reels: [{ caption: "short", video: "v", thumb: "t" }] });
    expect(small.reels[0]).toEqual({ caption: "short", video: "v", thumb: "t" });
  });
});

// A reader over a fake Chromium: each goto answers from `pages`, keyed by address.
function fakeBrowser(pages, loads) {
  return async () => ({
    newContext: async () => ({
      newPage: async () => {
        let at = "";
        return {
          goto: async (url) => {
            loads.push(url);
            const p = pages[url] ?? { html: "<html></html>", body: "Sorry, this page isn't available." };
            at = p.redirect ?? url;
            return { text: async () => p.html, status: () => p.status ?? 200 };
          },
          url: () => at,
          content: async () => "",
          innerText: async () => pages[loads.at(-1)]?.body ?? "Sorry, this page isn't available.",
        };
      },
      close: async () => {},
    }),
    close: async () => {},
  });
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "ig-reader-test-"));
const clock = () => {
  const c = { t: Date.parse("2026-11-04T12:00:00.000Z"), slept: [] };
  c.now = () => c.t;
  c.sleep = async (ms) => (c.slept.push(ms), (c.t += ms));
  return c;
};

describe("the reader", () => {
  it("reads a grid, then embed pages for the reels not already known, 3 s apart", async () => {
    const loads = [];
    const c = clock();
    const pages = {
      "https://www.instagram.com/made.up_creator/reels/": { html: gridHtml(USER, [node("DMadeUp0001", 51000), node("DMadeUp0002", 2000), node("DMadeUp0003", 900)]) },
      "https://www.instagram.com/reel/DMadeUp0002/embed/captioned/": { html: embedHtml("DMadeUp0002", "second") },
      "https://www.instagram.com/reel/DMadeUp0003/embed/captioned/": { html: embedHtml("DMadeUp0003", "third") },
    };
    const dir = tmp();
    const reader = createReader({ launch: fakeBrowser(pages, loads), stateDir: dir, now: c.now, sleep: c.sleep });
    const a = await readReels({ handle: "made.up_creator", known: ["DMadeUp0001"], embeds: 12 }, reader, { now: c.now });
    expect(loads).toEqual(Object.keys(pages));
    expect(c.slept).toEqual([PACE_MS, PACE_MS]);
    expect(a.reels.map((r) => r.caption)).toEqual(["", "second", "third"]);
    expect(a.paused).toBeUndefined();
    await reader.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("pauses every read for 6 hours at a login wall, keeps the pause across a restart, and keeps what was read", async () => {
    const loads = [];
    const c = clock();
    const dir = tmp();
    const pages = {
      "https://www.instagram.com/made.up_creator/reels/": { html: gridHtml(USER, [node("DMadeUp0001", 51000), node("DMadeUp0002", 2000)]) },
      "https://www.instagram.com/reel/DMadeUp0001/embed/captioned/": { html: "", redirect: "https://www.instagram.com/accounts/login/?next=x" },
    };
    const reader = createReader({ launch: fakeBrowser(pages, loads), stateDir: dir, now: c.now, sleep: c.sleep });
    const a = await readReels({ handle: "made.up_creator", known: [] }, reader, { now: c.now });
    const until = new Date(c.t + PAUSE_MS).toISOString();
    expect(a.paused).toEqual({ until, why: "login" });
    expect(a.profile.handle).toBe("made.up_creator");
    expect(loads).toHaveLength(2);
    // a new reader (the worker restarted) loads nothing until the pause ends
    const again = createReader({ launch: fakeBrowser(pages, loads), stateDir: dir, now: c.now, sleep: c.sleep });
    expect(await readReel({ code: "DMadeUp0002" }, again)).toEqual({ paused: { until, why: "login" } });
    expect(await readCreators([{ handle: "made.up_creator", why: "w" }, { handle: "second.one", why: "" }], again)).toEqual({
      creators: [{ handle: "made.up_creator", why: "w", error: "Reads are paused." }, { handle: "second.one", why: "", error: "Reads are paused." }],
      paused: { until, why: "login" },
    });
    expect(loads).toHaveLength(2);
    c.t += PAUSE_MS + 1;
    await expect(readReel({ code: "DMadeUp0002" }, again)).rejects.toThrow("couldn't be read");
    expect(loads).toHaveLength(3);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("says plainly when an account is private or not there, and reads a search's creators one by one", async () => {
    const loads = [];
    const c = clock();
    const dir = tmp();
    const pages = {
      "https://www.instagram.com/made.up_creator/reels/": { html: gridHtml(USER, [node("DPinned0001", 9e6, { clips_tab_pinned_user_ids: [PK] }), node("DMadeUp0001", 51000), node("DMadeUp0002", 2000), node("DMadeUp0003", 90000), node("DMadeUp0004", 10)]) },
      "https://www.instagram.com/locked.one/reels/": { html: gridHtml({ ...USER, username: "locked.one", is_private: true }, []) },
    };
    const reader = createReader({ launch: fakeBrowser(pages, loads), stateDir: dir, now: c.now, sleep: c.sleep });
    await expect(readReels({ handle: "locked.one" }, reader)).rejects.toThrow("@locked.one's account is private.");
    await expect(readReels({ handle: "gone.one" }, reader)).rejects.toThrow("There's no Instagram account @gone.one.");
    const r = await readCreators([{ handle: "made.up_creator", why: "money" }, { handle: "gone.one", why: "" }], reader);
    expect(r.creators[0].reels.map((x) => x.code)).toEqual(["DMadeUp0003", "DMadeUp0001", "DMadeUp0002"]);
    expect(r.creators[1]).toEqual({ handle: "gone.one", why: "", error: "There's no Instagram account @gone.one." });
    await expect(readReels({ handle: "../etc" }, reader)).rejects.toThrow("no Instagram username");
    await expect(readReel({ code: "../x" }, reader)).rejects.toThrow("no reel");
    expect(loads.every((u) => u.startsWith("https://www.instagram.com/"))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("the reader when things go wrong", () => {
  it("pauses on a please-wait page with no data, but not on a caption that says try again later", async () => {
    const loads = [];
    const c = clock();
    const dir = tmp();
    const pages = {
      "https://www.instagram.com/made.up_creator/reels/": { html: gridHtml(USER, [node("DMadeUp0001", 51000)]) },
      "https://www.instagram.com/reel/DMadeUp0001/embed/captioned/": { html: embedHtml("DMadeUp0001", "Missed it? Try again later."), body: "Missed it? Try again later." },
      "https://www.instagram.com/second.one/reels/": { html: "<html></html>", body: "Please wait a few minutes before you try again." },
    };
    const reader = createReader({ launch: fakeBrowser(pages, loads), stateDir: dir, now: c.now, sleep: c.sleep });
    const a = await readReels({ handle: "made.up_creator" }, reader, { now: c.now });
    expect([a.reels[0].caption, a.paused]).toEqual(["Missed it? Try again later.", undefined]);
    expect(await readReels({ handle: "second.one" }, reader, { now: c.now })).toEqual({ paused: { until: new Date(c.t + PAUSE_MS).toISOString(), why: "wait" } });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("stops opening pages at its deadline or when the worker stops, and keeps what it read", async () => {
    const loads = [];
    const c = clock();
    const dir = tmp();
    const pages = {
      "https://www.instagram.com/made.up_creator/reels/": { html: gridHtml(USER, [node("DMadeUp0001", 900), node("DMadeUp0002", 800), node("DMadeUp0003", 700)]) },
      "https://www.instagram.com/second.one/reels/": { html: gridHtml({ ...USER, username: "second.one" }, [node("DMadeUp0004", 5)]) },
      "https://www.instagram.com/third.one/reels/": { html: gridHtml({ ...USER, username: "third.one" }, [node("DMadeUp0005", 5)]) },
    };
    for (const code of ["DMadeUp0001", "DMadeUp0002", "DMadeUp0003"]) pages[`https://www.instagram.com/reel/${code}/embed/captioned/`] = { html: embedHtml(code, `caption ${code}`) };
    const reader = createReader({ launch: fakeBrowser(pages, loads), stateDir: dir, now: c.now, sleep: c.sleep });
    // the deadline passes during the first embed page (each page waits its 3 s): the rest are never opened
    const a = await readReels({ handle: "made.up_creator" }, reader, { now: c.now, deadline: c.t + 1 });
    expect(a.reels.map((r) => r.caption)).toEqual(["caption DMadeUp0001", "", ""]);
    expect(loads).toHaveLength(2);
    const stopped = new AbortController();
    stopped.abort();
    expect((await readReels({ handle: "made.up_creator" }, reader, { now: c.now, signal: stopped.signal })).reels).toHaveLength(3);
    expect(loads).toHaveLength(3);
    const found = [{ handle: "made.up_creator", why: "" }, { handle: "second.one", why: "" }, { handle: "third.one", why: "" }];
    // each grid waits its 3 s too: the deadline passes while the second one loads
    const r = await readCreators(found, reader, { now: c.now, deadline: c.t + PACE_MS });
    expect(r.creators.map((x) => x.error ?? x.profile.handle)).toEqual(["made.up_creator", "second.one", "Not read: the search ran out of time."]);
    expect(loads).toHaveLength(5);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("keeps a pause in memory when its file can't be written, so the next read still waits", async () => {
    const loads = [];
    const c = clock();
    const dir = tmp();
    // a file where the state folder should be: the pause can't be saved
    const stateDir = path.join(dir, "not-a-folder");
    fs.writeFileSync(stateDir, "");
    const pages = { "https://www.instagram.com/made.up_creator/reels/": { html: "", redirect: "https://www.instagram.com/accounts/login/" } };
    const reader = createReader({ launch: fakeBrowser(pages, loads), stateDir, now: c.now, sleep: c.sleep });
    const until = new Date(c.t + PAUSE_MS).toISOString();
    expect(await readReels({ handle: "made.up_creator" }, reader, { now: c.now })).toEqual({ paused: { until, why: "login" } });
    expect(await readReel({ code: "DMadeUp0002" }, reader)).toEqual({ paused: { until, why: "login" } });
    expect(loads).toHaveLength(1);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("starts Chromium again after it fails, and gives up on a load that hangs instead of stopping every read", async () => {
    const dir = tmp();
    let launches = 0;
    let mode = "crash";
    const launch = async () => {
      launches++;
      return {
        on: () => {},
        close: async () => {},
        newContext: async () => {
          if (mode === "crash") throw new Error("Target closed");
          return {
            close: async () => {},
            newPage: async () => ({
              goto: () => (mode === "hang" ? new Promise(() => {}) : Promise.resolve({ text: async () => gridHtml(USER, [node("DMadeUp0001", 5)]), status: () => 200 })),
              url: () => "https://www.instagram.com/made.up_creator/reels/",
              content: async () => "",
              innerText: async () => "",
            }),
          };
        },
      };
    };
    const reader = createReader({ launch, stateDir: dir, sleep: async () => {} });
    await expect(reader.load("https://www.instagram.com/made.up_creator/reels/")).rejects.toThrow("Target closed");
    mode = "ok";
    await expect(reader.load("https://www.instagram.com/made.up_creator/reels/")).resolves.toMatchObject({ status: 200 });
    expect(launches).toBe(2);
    vi.useFakeTimers();
    try {
      mode = "hang";
      const hung = reader.load("https://www.instagram.com/made.up_creator/reels/").catch((e) => e);
      await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS + 10);
      expect((await hung).message).toMatch("took too long");
      mode = "ok";
      const next = reader.load("https://www.instagram.com/made.up_creator/reels/");
      await vi.advanceTimersByTimeAsync(10);
      await expect(next).resolves.toMatchObject({ status: 200 });
      expect(launches).toBe(3);
    } finally {
      vi.useRealTimers();
      await reader.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

it("Paused carries its pause", () => {
  expect(new Paused({ until: "x", why: "wait" }).pause).toEqual({ until: "x", why: "wait" });
});
