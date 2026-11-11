import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {}, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
vi.mock("@/lib/videoMedia", () => ({ deleteFile: async () => {}, putFile: async () => {}, getFile: async () => undefined, encodeWav: () => new Blob() }));

import { LOOKS } from "./aiVideo";
import { captionStart } from "./captionLooks";
import { startLook } from "./clipAsk";
import {
  DEFAULT_CHOICES, TEXT_STYLES, boxStyleOf, loadPostChoices, looksFor, mentionFor, mentionParam, nextLook, pickLook, presenterStarts, savePostChoices, textStyleFor,
  type PostChoices,
} from "./postChoices";
import { addProfile, setActiveProfile } from "./profiles";
import { saveStyleHint, DEFAULT_STYLE } from "./slideshow";
import { slideLook } from "./slideshowJob";
import { defaultWho, type Speakers } from "./talkingHead";
import { defaultSettings, withLook } from "./videoEdit";
import type { VideoSkill } from "./videoSkills";
import { wallSize } from "./wallJob";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

let local: MemStorage;
beforeEach(() => {
  local = new MemStorage();
  vi.stubGlobal("window", { localStorage: local });
  vi.stubGlobal("localStorage", local);
});
afterEach(() => vi.unstubAllGlobals());

const choose = (patch: Partial<PostChoices>) => savePostChoices(UID, { ...DEFAULT_CHOICES, ...patch });
const WOMAN = LOOKS[0];
const MAN = LOOKS[1];
const people = (look: string): Speakers => ({ face: null, who: "pr-1", presenters: [{ id: "pr-1", name: "Mei", look, url: "https://x", photo: "", createdAt: "", status: "on" }] });

describe("with nothing chosen, every maker starts as it does today", () => {
  it("reads the defaults from an empty, unreadable or out-of-range record", () => {
    expect(loadPostChoices(UID)).toEqual(DEFAULT_CHOICES);
    local.setItem(`content-studio-post-choices-${UID}`, "{bad");
    expect(loadPostChoices(UID)).toEqual(DEFAULT_CHOICES);
    local.setItem(`content-studio-post-choices-${UID}`, JSON.stringify({ who: "robots", mention: 3, captions: "neon", textStyles: ["box", "nope"] }));
    expect(loadPostChoices(UID)).toEqual({ ...DEFAULT_CHOICES, textStyles: ["box"] });
  });

  it("mentions the business unless the maker remembers otherwise, and keeps yes out of the URL", () => {
    expect(mentionFor(UID, null, true, false)).toBe(true);
    expect(mentionFor(UID, null, false, true)).toBe(false);
    expect(mentionParam(UID, true)).toBeNull();
    expect(mentionParam(UID, false)).toBe("no");
  });

  it("offers every presenter look and preselects the brand's saved presenter", () => {
    expect(looksFor(UID, LOOKS)).toEqual(LOOKS);
    expect(presenterStarts(UID, MAN, false)).toBe(true);
    expect(defaultWho(people(MAN), (l) => presenterStarts(UID, l, false))).toBe("pr-1");
    expect(defaultWho({ ...people(MAN), who: "ask" })).toBe("");
    expect(defaultWho({ ...people(MAN), who: "me" }, () => false)).toBe("mine");
  });

  it("starts a video in Bold captions and a slideshow in the device's last text style", () => {
    expect(captionStart(UID)).toEqual(defaultSettings("bold"));
    expect(textStyleFor(UID)).toBeNull();
    saveStyleHint({ ...DEFAULT_STYLE, font: "serif" });
    expect(slideLook(UID).font).toBe("serif");
  });
});

describe("each choice is what its makers start from", () => {
  it("Name your business: Never is off, Sometimes follows the make's flip", () => {
    choose({ mention: "never" });
    expect(mentionFor(UID, null, true, true)).toBe(false);
    choose({ mention: "sometimes" });
    expect(mentionFor(UID, null, true, true)).toBe(true);
    expect(mentionFor(UID, null, true, false)).toBe(false);
    const n = Array.from({ length: 400 }, () => mentionFor(UID)).filter(Boolean).length;
    expect(n).toBeGreaterThan(140);
    expect(n).toBeLessThan(260);
  });

  it("Who appears: only that look is picked, cycled and preselected", () => {
    choose({ who: "women" });
    const women = looksFor(UID, LOOKS);
    expect(women).toHaveLength(3);
    expect(women.every((l) => /\bwoman\b/.test(l))).toBe(true);
    for (let i = 0; i < 20; i++) expect(women).toContain(pickLook(UID, LOOKS));
    expect(nextLook(UID, LOOKS, women[2])).toBe(women[0]);
    expect(nextLook(UID, LOOKS, MAN)).toBe(women[0]);
    expect(defaultWho(people(MAN), (l) => presenterStarts(UID, l, true))).toBe("");
    expect(defaultWho(people(WOMAN), (l) => presenterStarts(UID, l, true))).toBe("pr-1");
    choose({ who: "men" });
    expect(looksFor(UID, LOOKS).every((l) => /\bman\b/.test(l))).toBe(true);
    // a list the choice would empty is offered whole, never nothing
    expect(looksFor(UID, [WOMAN])).toEqual([WOMAN]);
  });

  it("Your influencers: Never leaves the saved presenter unpicked, Sometimes follows the flip", () => {
    choose({ influencers: "never" });
    expect(defaultWho(people(WOMAN), (l) => presenterStarts(UID, l, true))).toBe("");
    choose({ influencers: "sometimes" });
    expect(presenterStarts(UID, WOMAN, true)).toBe(true);
    expect(presenterStarts(UID, WOMAN, false)).toBe(false);
  });

  it("Spoken captions: the editor's new video starts in the chosen look, or with none", () => {
    choose({ captions: "minimal" });
    expect(captionStart(UID).style).toBe("minimal");
    expect(startLook([], "", captionStart(UID)).settings.style).toBe("minimal");
    choose({ captions: "off" });
    expect(captionStart(UID)).toEqual({ ...defaultSettings("bold"), captions: false });
  });

  it("Post text style: a ticked style dresses a new slideshow and sizes a wall in its font", () => {
    choose({ textStyles: ["box", "heavy"] });
    expect(textStyleFor(UID, () => 0)).toBe(TEXT_STYLES.heavy);
    expect(textStyleFor(UID, () => 0.99)).toBe(TEXT_STYLES.box);
    saveStyleHint({ ...DEFAULT_STYLE, font: "serif" });
    choose({ textStyles: ["box"] });
    expect(slideLook(UID)).toEqual({ font: "clean", bg: "white", color: "#111111", stroke: 0, shadow: false });
    expect(boxStyleOf(TEXT_STYLES.bar)).toMatchObject({ bg: "bar", color: "#FFFFFF" });
    // the wall's fit measures in the style's font: wider letters step the size down
    const measure = (t: string, css: string) => t.length * (css.startsWith("900") ? 60 : 20);
    const words = "one two three four five six seven eight nine ten ".repeat(6);
    expect(wallSize(words, measure, "heavy")).toBeLessThan(wallSize(words, measure));
  });
});

describe("a pick on the maker's own page wins", () => {
  it("mention=yes or no on the URL beats Never, Sometimes and Always, and a Yes pick is written out", () => {
    choose({ mention: "never" });
    expect(mentionFor(UID, "yes", false, false)).toBe(true);
    expect(mentionFor(UID, "inside", false, false)).toBe(true);
    expect(mentionParam(UID, true)).toBe("yes");
    choose({ mention: "always" });
    expect(mentionFor(UID, "no", true, true)).toBe(false);
  });

  it("the editor's default skill is laid over the chosen captions", () => {
    choose({ captions: "minimal" });
    const skill = { id: "mine", name: "mine", look: { style: "cutout" }, prompt: "", isDefault: true, updatedAt: "" } as VideoSkill;
    expect(startLook([skill], "", captionStart(UID)).settings).toEqual(withLook(captionStart(UID), { style: "cutout" }));
    expect(startLook([skill], "", captionStart(UID)).settings.style).toBe("cutout");
  });
});

describe("storage", () => {
  it("keeps one record per brand under the synced prefix", () => {
    choose({ who: "women", textStyles: ["bar"] });
    expect(JSON.parse(local.getItem(`content-studio-post-choices-${UID}`)!)).toMatchObject({ who: "women", textStyles: ["bar"] });
    const p = addProfile(UID, "MoneyBees");
    setActiveProfile(UID, p.id);
    expect(loadPostChoices(UID)).toEqual(DEFAULT_CHOICES);
    choose({ mention: "never" });
    expect(JSON.parse(local.getItem(`content-studio-post-choices-${UID}~${p.id}`)!).mention).toBe("never");
    expect(JSON.parse(local.getItem(`content-studio-post-choices-${UID}`)!).mention).toBe("always");
  });

  it("says when the browser refuses the write", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw new Error("full"); } });
    expect(choose({ who: "men" })).toBe(false);
  });
});
