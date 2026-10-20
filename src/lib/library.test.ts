import { describe, expect, it } from "vitest";
import type { AiJob } from "@/lib/aiVideo";
import type { SavedCarousel } from "@/lib/carousel";
import type { DraftEntry } from "@/lib/draftHistory";
import { links, withRemix } from "@/lib/links";
import type { MediaItem } from "@/lib/mediaLibrary";
import type { RemixJobState } from "@/lib/remixJob";
import type { Slideshow } from "@/lib/slideshow";
import type { JoinJob } from "@/lib/videoMedia";
import type { VideoProject } from "@/lib/videoProjects";
import {
  aiJobs,
  buildLibrary,
  countBy,
  exportJobs,
  filterLibrary,
  imageJobs,
  joinJobs,
  madeCount,
  montageJobs,
  remixJobs,
  statusLine,
  type LibraryItem,
  type LibraryJob,
} from "./library";

const NOW = new Date("2026-10-20T10:00:00.000Z");

const draft = (id: string, over: Partial<DraftEntry> = {}): DraftEntry => ({
  id,
  createdAt: "2026-10-10T01:00:00.000Z",
  hook: `Hook ${id}`,
  draft: `Body of ${id}`,
  pillar: "topic",
  pillarDetail: "",
  audience: "general",
  format: "text-post",
  platform: "linkedin",
  ctaType: "comment-keyword",
  ...over,
});
const carousel = (id: string, over: Partial<SavedCarousel> = {}): SavedCarousel => ({
  id,
  title: `Carousel ${id}`,
  platform: "instagram",
  slides: [
    { id: "s1", title: "Three signs", body: "you need a plan" },
    { id: "s2", title: "Sign one", body: "zanzibar savings" },
  ],
  updatedAt: "2026-10-11T01:00:00.000Z",
  ...over,
});
const project = (id: string, over: Partial<VideoProject> = {}): VideoProject =>
  ({ id, name: `Clip ${id}`, createdAt: "2026-10-12T01:00:00.000Z", updatedAt: "2026-10-12T01:00:00.000Z", duration: 20, size: 1, words: [], settings: {}, thumb: `data:image/jpeg;base64,${id}`, ...over }) as VideoProject;
const show = (id: string, over: Partial<Slideshow> = {}): Slideshow => ({
  id,
  title: `Show ${id}`,
  size: "9x16",
  overlay: { darken: 0.2, mark: "off" },
  slides: [{ id: "a", boxes: [] }, { id: "b", boxes: [] }],
  updatedAt: "2026-10-13T01:00:00.000Z",
  ...over,
});
const picture = (key: string, folder: string): MediaItem => ({ key, name: `Pic ${key}`, folder, alt: "a quiet harbour", width: 1, height: 1, addedAt: "2026-10-14T01:00:00.000Z" });

const build = (o: Partial<Parameters<typeof buildLibrary>[0]> = {}) =>
  buildLibrary({ drafts: [], carousels: [], slideshows: [], projects: [], media: [], jobs: [], now: NOW, ...o });
const byKey = (items: LibraryItem[], key: string) => items.find((i) => i.key === key)!;

describe("buildLibrary", () => {
  const items = build({
    drafts: [
      draft("t1"),
      draft("t2", { format: "text-post" }),
      draft("video-p1", { format: "short-video", hook: "" , draft: "" }),
      draft("sv", { format: "short-video" }),
      draft("cd", { format: "carousel" }),
      draft("ss", { format: "carousel" }),
    ],
    carousels: [carousel("d:t2", { draftId: "t2" }), carousel("p:1")],
    slideshows: [show("sh1", { draftId: "ss" }), show("sh2")],
    projects: [project("p1"), project("p2")],
    media: [picture("cimg-aaaaaa", "AI images"), picture("cimg-bbbbbb", "Shoot")],
  });

  it("shows each made thing once, with the right format", () => {
    expect(items.map((i) => i.key).sort()).toEqual(
      ["d:t1", "d:t2", "d:video-p1", "d:sv", "d:cd", "d:ss", "c:p:1", "s:sh2", "v:p2", "i:cimg-aaaaaa"].sort(),
    );
    const fmt = Object.fromEntries(items.map((i) => [i.key, i.format]));
    expect(fmt).toMatchObject({
      "d:t1": "text",
      "d:t2": "carousel",
      "d:video-p1": "video",
      "d:sv": "video",
      "d:cd": "carousel",
      "d:ss": "carousel",
      "c:p:1": "carousel",
      "s:sh2": "carousel",
      "v:p2": "video",
      "i:cimg-aaaaaa": "image",
    });
    expect(items.every((i) => i.status === "ready")).toBe(true);
  });

  it("links each card to its maker", () => {
    expect(byKey(items, "d:t1").href).toBe(links.generate({ draft: "t1" }));
    expect(byKey(items, "d:t2").href).toBe(links.carousel({ carousel: "d:t2" }));
    expect(byKey(items, "d:cd").href).toBe(links.carousel({ draft: "cd" }));
    expect(byKey(items, "d:ss").href).toBe(links.slideshow({ s: "sh1" }));
    expect(byKey(items, "d:video-p1").href).toBe(links.edit({ p: "p1" }));
    expect(byKey(items, "c:p:1").href).toBe(links.carousel({ carousel: "p:1" }));
    expect(byKey(items, "s:sh2").href).toBe(links.slideshow({ s: "sh2" }));
    expect(byKey(items, "v:p2").href).toBe(links.edit({ p: "p2" }));
    expect(byKey(items, "i:cimg-aaaaaa").href).toBe(links.media({ folder: "AI images", q: "Pic cimg-aaaaaa" }));
    expect(byKey(items, "d:t1").scheduleHref).toBe(`${links.calendar({ post: "t1" })}&view=month`);
  });

  it("gives a tied draft its carousel slide, slideshow or video thumb and name", () => {
    expect(byKey(items, "d:t2").thumb).toEqual({ kind: "slide", carouselId: "d:t2" });
    expect(byKey(items, "d:ss").thumb).toEqual({ kind: "show", showId: "sh1" });
    const v = byKey(items, "d:video-p1");
    expect(v.thumb).toEqual({ kind: "url", url: "data:image/jpeg;base64,p1" });
    expect(v.title).toBe("Clip p1");
    expect(v.file).toBe("p1");
    expect(byKey(items, "v:p2").file).toBe("p2");
  });

  it("never shows a tied carousel as a second card, even two of them", () => {
    const two = build({ drafts: [draft("t2")], carousels: [carousel("d:t2", { draftId: "t2" }), carousel("x", { draftId: "t2" })] });
    expect(two.map((i) => i.key)).toEqual(["d:t2"]);
  });

  it("notes a short video with no project as script only", () => {
    expect(byKey(items, "d:sv").note).toBe("Script only");
    expect(byKey(items, "d:video-p1").note).toBeUndefined();
  });

  it("sorts newest first", () => {
    const at = items.map((i) => i.at);
    expect([...at].sort().reverse()).toEqual(at);
    expect(items[0].key).toBe("i:cimg-aaaaaa");
  });

  it("reads status from the draft and from Zernio", () => {
    const list = build({
      drafts: [
        draft("sched", { status: "scheduled", scheduledFor: "2026-10-23T20:00", zernio: { key: "k", postId: "z1", status: "scheduled" } }),
        draft("part", { status: "scheduled", scheduledFor: "2026-10-18", zernio: { key: "k", postId: "z2", status: "partial", error: "TikTok said no" } }),
        draft("fail", { status: "scheduled", scheduledFor: "2026-10-18", zernio: { key: "k", postId: "z3", status: "failed" } }),
        draft("cancel", { zernio: { key: "k", postId: "z4", status: "cancelled" } }),
        draft("posted", { status: "posted", postedAt: "2026-10-15T02:00:00.000Z", zernio: { key: "k", postId: "z5", status: "published", links: [{ platform: "instagram", url: "https://instagram.com/p/x" }] } }),
      ],
    });
    expect(byKey(list, "d:sched")).toMatchObject({ status: "scheduled", when: "2026-10-23T20:00", autoPost: true });
    expect(byKey(list, "d:sched").scheduleHref).toBeUndefined();
    expect(byKey(list, "d:part")).toMatchObject({ status: "failed", note: "Zernio couldn't post it: TikTok said no", retryHref: links.drafts({ status: "scheduled" }) });
    expect(byKey(list, "d:fail")).toMatchObject({ status: "failed", note: "Zernio couldn't post it." });
    expect(byKey(list, "d:cancel").status).toBe("ready");
    expect(byKey(list, "d:posted")).toMatchObject({ status: "posted", live: [{ platform: "instagram", url: "https://instagram.com/p/x" }] });
  });

  it("turns jobs into making, failed and ready cards", () => {
    const jobs: LibraryJob[] = [
      { kind: "ai", label: "Avatar video", format: "video", state: "working", step: "Making the voiceover", href: "/edit" },
      { kind: "image", label: "AI picture", format: "image", state: "failed", error: "Out of credit", href: "/generate" },
      { kind: "join", label: "My clip", format: "video", state: "ready", step: "Open it in the editor", href: "/edit" },
    ];
    const list = build({ jobs, drafts: [draft("t1")] });
    expect(byKey(list, "j:ai")).toMatchObject({ status: "making", note: "Making the voiceover", at: NOW.toISOString() });
    expect(byKey(list, "j:image")).toMatchObject({ status: "failed", note: "Out of credit", retryHref: "/generate" });
    expect(byKey(list, "j:join")).toMatchObject({ status: "ready", format: "video" });
    expect(list[list.length - 1].key).toBe("d:t1");
  });
});

describe("filterLibrary, countBy and madeCount", () => {
  const items = build({
    drafts: [draft("t1"), draft("t2", { status: "scheduled", scheduledFor: "2026-10-23" }), draft("v", { format: "short-video", status: "scheduled", scheduledFor: "2026-10-24" })],
    carousels: [carousel("d:t1", { draftId: "t1" })],
    jobs: [
      { kind: "ai", label: "Explainer", format: "video", state: "working", step: "x", href: "/edit" },
      { kind: "montage", label: "Montage", format: "video", state: "failed", error: "y", href: "/edit" },
    ],
  });

  it("combines format and status", () => {
    expect(filterLibrary(items, { format: "video", status: "scheduled" }).map((i) => i.key)).toEqual(["d:v"]);
    expect(filterLibrary(items, { format: "video" })).toHaveLength(3);
    expect(filterLibrary(items, { status: "scheduled" })).toHaveLength(2);
  });

  it("finds a word that only appears on a carousel slide, in any case", () => {
    expect(filterLibrary(items, { q: "ZANZIBAR" }).map((i) => i.key)).toEqual(["d:t1"]);
    expect(filterLibrary(items, { q: "zanzibar", format: "text" })).toEqual([]);
  });

  it("counts per status and leaves making and failed out of made", () => {
    expect(countBy(items)).toEqual({ all: 5, ready: 1, scheduled: 2, posted: 0, making: 1, failed: 1 });
    expect(madeCount(items)).toBe(3);
  });
});

describe("statusLine", () => {
  it("says when it goes out, when it went out, or that it isn't scheduled", () => {
    expect(statusLine({ status: "ready" })).toBe("Not scheduled yet");
    expect(statusLine({ status: "scheduled", when: "2026-10-23T20:00" })).toBe("Goes out Fri 23 Oct, 8pm");
    expect(statusLine({ status: "scheduled", when: "2026-10-23" })).toBe("Goes out Fri 23 Oct");
    expect(statusLine({ status: "posted", when: "2026-10-15" })).toBe("Posted Thu 15 Oct");
    expect(statusLine({ status: "making", note: "Making the voiceover" })).toBe("Making the voiceover");
  });
});

describe("job mappers", () => {
  const ai = (over: Partial<AiJob>): AiJob => ({ kind: "avatar", state: "working", step: "Making the voiceover", ...over });

  it("maps a working AI job with its step and a failed one with its error; a done one adds nothing", () => {
    expect(aiJobs(ai({}), null)).toEqual([
      { kind: "ai", label: "Avatar video", format: "video", state: "working", step: "Making the voiceover", href: links.edit({ panel: ["ai"], kind: "avatar" }) },
    ]);
    expect(aiJobs(ai({ kind: "explainer", state: "failed", error: "No voice" }), null)[0]).toMatchObject({ state: "failed", error: "No voice", href: links.edit({ panel: ["ai"], kind: "explainer" }) });
    expect(aiJobs(ai({ state: "done" }), null)).toEqual([]);
  });

  it("links a presenter job to kind=avatar and files it as a picture", () => {
    expect(aiJobs(ai({ kind: "presenter" }), null)[0]).toMatchObject({ label: "Presenter picture", format: "image", href: links.edit({ panel: ["ai"], kind: "avatar" }) });
  });

  it("shows a paid avatar or template clip waiting after a reload, only when no job is in memory", () => {
    expect(aiJobs(null, {})[0]).toMatchObject({ state: "working", label: "Avatar video", href: links.edit({ panel: ["ai"], kind: "avatar" }) });
    expect(aiJobs(null, { kind: "template" })[0]).toMatchObject({ label: "Template clip", href: links.edit({ panel: ["ai"], kind: "template" }) });
    expect(aiJobs(ai({ state: "failed", error: "Dropped" }), {})).toHaveLength(1);
    expect(aiJobs(null, null)).toEqual([]);
  });

  it("follows the montage's state in its step", () => {
    const href = links.edit({ panel: ["ai"], kind: "montage" });
    expect(montageJobs({ state: "writing", done: 0, of: 0 })).toEqual([{ kind: "montage", label: "Montage", format: "video", href, state: "working", step: "Writing the beats" }]);
    expect(montageJobs({ state: "finding", done: 2, of: 6 })[0].step).toBe("Finding clips 2 of 6");
    expect(montageJobs({ state: "joining", done: 6, of: 6 })[0].step).toBe("Putting it together");
    expect(montageJobs({ state: "failed", done: 0, of: 0, error: "No clips" })[0]).toMatchObject({ state: "failed", error: "No clips" });
    expect(montageJobs({ state: "done", done: 6, of: 6 })).toEqual([]);
  });

  it("counts an image that is saving as making", () => {
    expect(imageJobs({ prompt: "p", state: "saving" })[0]).toMatchObject({ state: "working", step: "Saving it to Media", format: "image", href: links.generate() });
    expect(imageJobs({ prompt: "p", state: "working" })[0].step).toBe("Making the picture");
    expect(imageJobs({ prompt: "p", state: "failed", error: "Nope" })[0]).toMatchObject({ state: "failed", error: "Nope" });
    expect(imageJobs({ prompt: "p", state: "done" })).toEqual([]);
  });

  it("shows a running or failed export, never a done one", () => {
    expect(exportJobs({ id: "3", name: "Reel", progress: 0.42, state: "running" })[0]).toMatchObject({ state: "working", step: "Exporting Reel 42%", href: links.edit() });
    expect(exportJobs({ id: "3", name: "Reel", progress: 1, state: "failed", error: "Out of memory" })[0]).toMatchObject({ state: "failed", error: "Out of memory" });
    expect(exportJobs({ id: "3", name: "Reel", progress: 1, state: "done" })).toEqual([]);
  });

  it("makes a finished join with a file a ready video", () => {
    const file = { name: "CPF top-ups.webm" } as File;
    expect(joinJobs({ progress: 1, state: "done", file } as JoinJob)).toEqual([
      { kind: "join", label: "CPF top-ups", format: "video", state: "ready", step: "Open it in the editor", href: links.edit() },
    ]);
    expect(joinJobs({ progress: 0.5, state: "running" })).toEqual([]);
    expect(joinJobs({ progress: 1, state: "done" })).toEqual([]);
    expect(joinJobs(null)).toEqual([]);
  });

  it("brings remix rows in, linked to the sheet on the run's own choices", () => {
    const run: RemixJobState["run"] = { keep: "structure", close: "balanced", mention: true, offer: null };
    const job: RemixJobState = {
      id: 7,
      key: "top:abc-XY1",
      state: "working",
      step: "Writing your carousel",
      run,
      rows: [
        { as: "post", state: "done", draftId: "d1" },
        { as: "carousel", state: "working", step: "Writing your carousel" },
        { as: "script", state: "waiting" },
        { as: "speaking", state: "failed", error: "No remixes left today." },
      ],
    };
    const rows = remixJobs(job);
    const href = withRemix(links.library(), "top:abc-XY1");
    expect(rows).toEqual([
      { kind: "remix-7-1", label: "Remix", format: "carousel", href, state: "working", step: "Writing your carousel" },
      { kind: "remix-7-2", label: "Remix", format: "video", href, state: "working", step: "Up next" },
      { kind: "remix-7-3", label: "Remix", format: "video", href, state: "failed", error: "No remixes left today." },
    ]);
    expect(remixJobs({ ...job, run: { ...run, keep: "hook", close: "close", mention: false } }, links.library({ format: "video" }))[0].href).toBe(
      `${links.library({ format: "video" })}&remix=top%3Aabc-XY1&keep=hook&close=close&mention=no`,
    );
    expect(remixJobs({ ...job, state: "failed" }).map((r) => r.state)).toEqual(["failed"]);
    expect(remixJobs(null)).toEqual([]);
  });
});

describe("links.library", () => {
  it("leaves defaults out", () => {
    expect(links.library()).toBe("/library");
    expect(links.library({ format: "video", status: "ready", q: " cpf ", panel: "making" })).toBe("/library?format=video&status=ready&q=cpf&panel=making");
  });
});
