import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
const fn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("./edgeFn")>()), callFn: fn }));
const ai = vi.hoisted(() => ({ busy: false, pending: null as { name: string; extra?: { toast?: string } } | null }));
vi.mock("@/lib/aiVideo", () => ({ aiBusy: () => ai.busy, pendingAvatar: () => ai.pending }));
const media = vi.hoisted(() => ({ handToEditor: vi.fn(), putFile: vi.fn(), getFile: vi.fn() }));
vi.mock("@/lib/videoMedia", async (orig) => ({ ...(await orig<typeof import("./videoMedia")>()), ...media }));
// the talking head's run, faked: a store and its listeners, moved by each test the way the real run moves
const talk = vi.hoisted(() => {
  type J = { id: number; state: string; step: string; error?: string; waiting?: boolean; script?: string } | null;
  let job: J = null;
  const ls = new Set<(j: J) => void>();
  return {
    get: () => job,
    set: (j: J) => {
      job = j;
      ls.forEach((l) => l(j && { ...j }));
    },
    on: (f: (j: J) => void) => {
      ls.add(f);
      return () => void ls.delete(f);
    },
    reset() {
      job = null;
      ls.clear();
    },
    start: vi.fn(),
    resume: vi.fn(),
  };
});
vi.mock("@/lib/talkingHeadJob", () => ({
  startTalk: talk.start,
  resumeTalk: talk.resume,
  goOnAtPrice: vi.fn(),
  onTalkJob: talk.on,
  talkJob: talk.get,
  talkBusy: () => ["writing", "presenter", "voice", "video", "joining"].includes(talk.get()?.state ?? ""),
  ownsPending: (p: { extra?: { toast?: string } } | null) => p?.extra?.toast === "Your talking head video is ready. Export it when it looks right.",
}));

import { EdgeError } from "./edgeFn";
import { formatJobs } from "./formatJob";
import {
  BEHIND_GONE, GREEN_TOAST, LIST_FAILED, LIST_REFUSED, NO_PERSON, OTHER_VIDEO, backdropOf, bdKey, canWriteList, greenCaps, greenExtra, greenJob, greenParams, greenPrice,
  greenReason, listPlan, loadTyped, noteItems, resumeGreen, saveTyped, startGreen, writeList, type GreenAsk,
} from "./greenScreen";
import { priceOf, sumPrices } from "./prices";
import type { RemixSource } from "./remixSource";
import { TALK_TOAST, talkPrice } from "./talkingHead";
import { sanitizeBackdrop } from "./faceVision";
import { joinAdd, withJoinAdd } from "./videoMedia";

const POST = { key: "ad:a1", kind: "ad", title: "Five money habits" } as unknown as RemixSource;
const NOTES = { title: "Three habits that keep you selling", items: ["List three people to call before nine", "Log every follow-up the same day", "Book the next step before you hang up"], caption: "Steal these. #sales" };
const SELFIE = new File(["selfie"], "me.mp4", { type: "video/mp4" });
const ASK: GreenAsk = {
  source: null, mention: true, who: "mine", behind: "notes", stand: "bottom", title: "", items: ["Wait a day before you buy"], pick: null, mine: SELFIE,
  talk: { text: "Why follow-ups win deals", look: "A Malay Singaporean man in his late 30s, light blue shirt", setting: "car", voice: "george", length: 15 },
};
const flush = () => new Promise((r) => setTimeout(r, 0));

let order: string[];
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  // the note is drawn to a PNG on the device: a picture that decodes and a canvas that hands back its blob
  vi.stubGlobal("Image", class { src = ""; decode = async () => {}; });
  vi.stubGlobal("document", {
    createElement: () => ({ width: 0, height: 0, getContext: () => ({ font: "", measureText: (t: string) => ({ width: t.length * 20 }), drawImage: () => {} }), toBlob: (cb: (b: Blob) => void) => cb(new Blob(["png"], { type: "image/png" })) }),
  });
  order = [];
  ai.busy = false;
  ai.pending = null;
  talk.reset();
  talk.start.mockReset().mockImplementation(() => void order.push("talk"));
  talk.resume.mockReset().mockReturnValue(true);
  fn.mockReset().mockImplementation(async (name: string, body: { mode: string; as: string; topic?: string; note?: string }) => {
    order.push(`${name} ${body.as} ${body.topic ?? ""}|${body.note ?? ""}`);
    return { result: { as: "notes", ...NOTES }, flags: { copied: [], claim: false, invented: false } };
  });
  media.putFile.mockReset().mockImplementation(async (key: string, b: Blob) => void order.push(`put ${key.slice(0, 6)} ${b.type}`));
  media.getFile.mockReset().mockResolvedValue(new Blob(["demo"]));
  media.handToEditor.mockReset().mockImplementation(async () => void order.push("hand"));
});

describe("the rules", () => {
  it("writes the list first only when no item is typed, from the post or from a title", () => {
    expect(listPlan({ title: "", items: ["Call back by nine"] }, POST)).toBeNull();
    expect(listPlan({ title: "", items: ["", " "] }, POST)).toBe("source");
    expect(listPlan({ title: "Follow-ups that close", items: [] }, null)).toBe("topic");
    expect(listPlan({ title: "ab", items: [] }, null)).toBeNull();
    expect(listPlan({ title: "x".repeat(201), items: [] }, null)).toBeNull();
    expect(canWriteList("", POST)).toBe(true);
    expect(canWriteList("ab", null)).toBe(false);
    expect(noteItems([" a ", "", "b", "c", "d", "e", "f", "g"])).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("keeps every device key one the editor's backdrop takes", () => {
    for (const [now, r] of [[0, 0], [Date.now(), 0.999], [9e12, 0.5]]) {
      const key = bdKey(now, r);
      expect(sanitizeBackdrop({ kind: "picture", key })).toEqual({ kind: "picture", key });
    }
    expect(backdropOf("demo", "bd-gs-1")).toEqual({ kind: "video", key: "bd-gs-1" });
    expect(backdropOf("notes", "bd-gs-1")).toEqual({ kind: "picture", key: "bd-gs-1" });
  });

  it("opens the editor on its face tab with the backdrop, the stand and a 9:16 frame", () => {
    const e = greenExtra({ backdrop: { kind: "video", key: "bd-gs-1" }, stand: "corner", caption: "Cap.", source: POST });
    expect(e).toMatchObject({ settings: { backdrop: { kind: "video", key: "bd-gs-1" }, stand: "corner", aspect: "9:16" }, tab: "face", toast: GREEN_TOAST, caption: "Cap." });
    expect(e.source?.key).toBe("ad:a1");
    expect(greenExtra({ backdrop: { kind: "picture", key: "bd-gs-1" }, stand: "bottom" })).not.toHaveProperty("caption");
  });

  it("prices your video by its captions, a write by remix, and a presenter as the talking head page does", () => {
    expect(greenPrice({ write: false, talk: null, minutes: 0.5 })).toEqual(priceOf("video-transcribe", { minutes: 0.5 }));
    expect(greenPrice({ write: true, talk: null, minutes: 0.5 })).toEqual(sumPrices(priceOf("remix-make"), priceOf("video-transcribe", { minutes: 0.5 })));
    expect(greenPrice({ write: false, talk: null, minutes: null })).toBeNull();
    const t = { length: 15 as const, write: true, presenter: true };
    expect(greenPrice({ write: true, talk: t, minutes: 0.5 })).toEqual(sumPrices(priceOf("remix-make"), talkPrice(t)));
    expect(greenCaps({ write: false, talk: null, minutes: 1 })).toEqual({ cap: "video-transcribe", caps: [] });
    expect(greenCaps({ write: true, talk: null, minutes: 1 })).toEqual({ cap: "remix-make", caps: ["video-transcribe"] });
    expect(greenCaps({ write: true, talk: t, minutes: null })).toEqual({ cap: "ai-video", caps: ["remix-make", "ai-voice", "ai-image"] });
  });

  it("says why Make the video waits, in order", () => {
    const base = { who: "mine" as const, behind: "notes" as const, person: "found" as const, note: { title: "", items: ["Call back"] }, source: null, pick: null, talk: null };
    expect(greenReason({ ...base, person: "none" })).toBe("Pick a video of you first.");
    expect(greenReason({ ...base, person: "loading" })).toBe("Getting the cut-out ready on this device...");
    expect(greenReason({ ...base, person: "nobody" })).toBe(NO_PERSON);
    expect(greenReason(base)).toBeNull();
    expect(greenReason({ ...base, note: { title: "", items: [] } })).toBe("Type the items, or a title to write them from.");
    expect(greenReason({ ...base, behind: "demo" })).toBe("Pick your demo video first.");
    expect(greenReason({ ...base, behind: "picture", pick: { kind: "demo", key: "bd-gs-1", name: "d.mp4" } })).toBe("Pick a picture first.");
    expect(greenReason({ ...base, behind: "picture", pick: { kind: "picture", key: "bd-gs-1", name: "p.png" } })).toBeNull();
    // a presenter's own line comes before the background's, and your video's check never applies
    expect(greenReason({ ...base, who: "presenter", person: "none", talk: OTHER_VIDEO })).toBe(OTHER_VIDEO);
    expect(greenReason({ ...base, who: "presenter", person: "none" })).toBeNull();
  });

  it("leaves the defaults out of the page's params", () => {
    expect(greenParams({ source: null, who: "mine", behind: "notes", stand: "bottom", mention: true })).toEqual({ source: undefined, mention: undefined, who: undefined, behind: undefined, stand: undefined });
    expect(greenParams({ source: POST, who: "presenter", behind: "demo", stand: "corner", mention: false })).toEqual({ source: "ad:a1", mention: "no", who: "presenter", behind: "demo", stand: "corner" });
  });

  it("keeps the typed note and the pick on this device, and drops junk", () => {
    saveTyped("u1", { title: "T", items: ["a", "b"], behind: { kind: "demo", key: "bd-gs-1", name: "d.mp4" } });
    expect(loadTyped("u1")).toEqual({ title: "T", items: ["a", "b"], behind: { kind: "demo", key: "bd-gs-1", name: "d.mp4" } });
    localStorage.setItem("cs-make-green-screen-u1", JSON.stringify({ title: 5, items: ["a", 3], behind: { kind: "demo", key: "v1-x", name: "d" } }));
    expect(loadTyped("u1")).toEqual({ title: "", items: ["a"] });
    localStorage.setItem("cs-make-green-screen-u1", "{nope");
    expect(loadTyped("u1")).toEqual({ title: "", items: [] });
  });
});

describe("your own video", () => {
  it("draws the typed list and hands your video to the editor, writing nothing", async () => {
    await startGreen("u1", ASK);
    expect(order).toEqual(["put bd-gs- image/png", "hand"]);
    const [file, extra] = media.handToEditor.mock.calls[0];
    expect(file).toBe(SELFIE);
    expect(extra.settings.backdrop.kind).toBe("picture");
    expect(extra.settings.backdrop.key).toBe(media.putFile.mock.calls[0][0]);
    expect(extra).toMatchObject({ tab: "face", toast: GREEN_TOAST, settings: { stand: "bottom", aspect: "9:16" } });
    expect(greenJob()?.state).toBe("done");
    expect(formatJobs().find((j) => j.slug === "green-screen")).toMatchObject({ state: "ready", href: "/edit" });
  });

  it("writes the list from the title when no item is typed, then draws it, and the caption rides along", async () => {
    await startGreen("u1", { ...ASK, title: "Follow-ups that close", items: [] });
    expect(order).toEqual(["remix notes Follow-ups that close|", "put bd-gs- image/png", "hand"]);
    expect(media.handToEditor.mock.calls[0][1].caption).toBe("Steal these. #sales");
    expect(greenJob()?.written).toEqual({ title: NOTES.title, items: NOTES.items });
    expect(loadTyped("u1").items).toEqual(NOTES.items);
  });

  it("stops before drawing when the list can't be written, with the right line", async () => {
    fn.mockRejectedValueOnce(new EdgeError("That remix didn't go through. Nothing was used.", 502, "failed"));
    await startGreen("u1", { ...ASK, title: "Follow-ups that close", items: [] });
    expect(greenJob()).toMatchObject({ state: "failed", error: LIST_FAILED });
    fn.mockRejectedValueOnce(new EdgeError("That topic can't be turned into something safe to post. Try another one.", 422, "refused"));
    await startGreen("u1", { ...ASK, title: "Guaranteed returns", items: [] });
    expect(greenJob()).toMatchObject({ state: "failed", error: LIST_REFUSED, refused: true });
    expect(media.putFile).not.toHaveBeenCalled();
    expect(media.handToEditor).not.toHaveBeenCalled();
  });

  it("puts a demo behind you as a video, and says so when its file left this device", async () => {
    const pick = { kind: "demo" as const, key: "bd-gs-demo1", name: "demo.mp4" };
    await startGreen("u1", { ...ASK, behind: "demo", pick, stand: "corner" });
    expect(order).toEqual(["hand"]);
    expect(media.handToEditor.mock.calls[0][1].settings).toMatchObject({ backdrop: { kind: "video", key: "bd-gs-demo1" }, stand: "corner" });
    media.getFile.mockResolvedValueOnce(undefined);
    await startGreen("u1", { ...ASK, behind: "demo", pick });
    expect(greenJob()).toMatchObject({ state: "failed", error: BEHIND_GONE, gone: true });
  });

  it("Write it for me fills the list and makes nothing else", async () => {
    await writeList("u1", { ...ASK, source: POST, title: "for a sales team" });
    expect(order).toEqual(["remix notes |for a sales team"]);
    expect(greenJob()).toMatchObject({ state: "written", writeOnly: true, written: { items: NOTES.items } });
    expect(formatJobs().find((j) => j.slug === "green-screen")).toBeUndefined();
  });
});

describe("an AI presenter", () => {
  const P = { ...ASK, who: "presenter" as const, mine: null };
  const PENDING = { name: "Honestly, most of us lose deals in the fo", extra: { toast: TALK_TOAST } };

  it("runs the talking head and puts this page's extra on its paid clip's join", async () => {
    await startGreen("u1", P);
    expect(order).toEqual(["put bd-gs- image/png", "talk"]);
    expect(talk.start.mock.calls[0][1]).toMatchObject({ who: "presenter", photo: null, setting: "car", voice: "george", length: 15, text: "Why follow-ups win deals" });
    talk.set({ id: 1, state: "presenter", step: "Making your presenter..." });
    expect(greenJob()).toMatchObject({ state: "talking", step: "Making your presenter..." });
    expect(joinAdd()).toBeNull();
    // the clip is paid for and pending: its join will open as a green screen, even after a reload
    ai.pending = PENDING;
    talk.set({ id: 1, state: "video", step: "Making your video, 0 of 2 parts ready. This takes a few minutes." });
    const joined = withJoinAdd(PENDING.name, { toast: TALK_TOAST, caption: "Three calls before nine." });
    expect(joined).toMatchObject({ toast: GREEN_TOAST, tab: "face", caption: "Three calls before nine.", settings: { stand: "bottom", aspect: "9:16" } });
    expect(joined?.settings?.backdrop?.kind).toBe("picture");
    talk.set({ id: 1, state: "joining", step: "Putting your video together..." });
    expect(greenJob()?.state).toBe("joining");
    talk.set({ id: 1, state: "done", step: "" });
    expect(greenJob()?.state).toBe("done");
  });

  it("drops the add when the run fails with nothing paid waiting, and keeps it when a paid clip waits", async () => {
    await startGreen("u1", P);
    ai.pending = PENDING;
    talk.set({ id: 1, state: "video", step: "Making your video" });
    expect(joinAdd()?.name).toBe(PENDING.name);
    talk.set({ id: 1, state: "failed", step: "", error: "Couldn't start the video right now. Try again in a minute.", waiting: true });
    expect(greenJob()).toMatchObject({ state: "failed", waiting: true });
    expect(joinAdd()?.name).toBe(PENDING.name);

    // a paid clip waiting is picked up at no cost, as a green screen
    expect(resumeGreen("u1")).toBe(true);
    expect(talk.resume).toHaveBeenCalled();
    expect(greenJob()?.state).toBe("talking");
    talk.set({ id: 2, state: "failed", step: "", error: "Higgsfield failed the video." });
    expect(joinAdd()).toBeNull();
  });

  it("never starts while another AI video holds the slot, and leaves a talking head that isn't its own", async () => {
    ai.busy = true;
    await startGreen("u1", P);
    expect(greenJob()).toMatchObject({ state: "failed", error: OTHER_VIDEO });
    expect(talk.start).not.toHaveBeenCalled();
    ai.busy = false;
    ai.pending = PENDING;
    expect(resumeGreen("u1")).toBe(false);
    await flush();
  });
});
