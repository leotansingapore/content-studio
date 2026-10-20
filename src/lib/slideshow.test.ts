import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { links } from "@/lib/links";
import {
  MAX_HISTORY,
  addBox,
  addSlide,
  ago,
  applyToAll,
  blankSlideshow,
  changeBox,
  deleteBox,
  deleteSlide,
  duplicateSlide,
  fromPost,
  loadSlideshows,
  loadStyleHint,
  makeBox,
  moveSlide,
  redo,
  remember,
  emptyHistory,
  removeSlideshow,
  sanitizeSlideshows,
  saveSlideshow,
  saveStyleHint,
  slideshowToDraft,
  undo,
  type Slideshow,
} from "@/lib/slideshow";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
});
afterEach(() => vi.unstubAllGlobals());

const ids = (s: Slideshow) => s.slides.map((x) => x.id);
const allIds = (s: Slideshow) => [...ids(s), ...s.slides.flatMap((x) => x.boxes.map((b) => b.id))];
const unique = (list: string[]) => new Set(list).size === list.length;
const withSlides = (n: number) => {
  let s = blankSlideshow();
  while (s.slides.length < n) s = addSlide(s, s.slides.length - 1);
  return s;
};

const box = (over: Record<string, unknown> = {}) => ({ id: "b1", text: "Hi", x: 0.5, y: 0.5, w: 0.8, font: "clean", size: 48, color: "#111111", stroke: 0, strokeColor: "#FFFFFF", bg: "white", ...over });

describe("sanitize", () => {
  it("drops boxes with bad fonts or colours, clamps numbers and keeps only cimg- keys", () => {
    const [s] = sanitizeSlideshows([
      {
        id: "ss1",
        title: "CPF myths",
        size: "9x16",
        overlay: { darken: 3, mark: "logo" },
        slides: [
          {
            id: "s1",
            image: "cimg-abc1234",
            photo: { src: "https://images.pexels.com/photos/1/a.jpeg?w=1080", by: "Ann", byUrl: "https://www.pexels.com/@ann" },
            boxes: [box(), box({ id: "b2", font: "comic" }), box({ id: "b3", color: "red" }), box({ id: "b4", x: 4, y: -2, w: 0.01, size: 900, stroke: 40, text: "x".repeat(500) })],
          },
          { id: "s2", image: "../etc/passwd", photo: { src: "https://evil.example/a.jpg", by: "x", byUrl: "" }, boxes: [] },
        ],
      },
    ]);
    expect(s.size).toBe("9x16");
    expect(s.overlay).toEqual({ darken: 0.8, mark: "logo" });
    expect(s.slides[0].image).toBe("cimg-abc1234");
    expect(s.slides[0].photo?.by).toBe("Ann");
    expect(s.slides[0].boxes.map((b) => b.id)).toEqual(["b1", "b4"]);
    expect(s.slides[0].boxes[1]).toMatchObject({ x: 1, y: 0, w: 0.2, size: 160, stroke: 12 });
    expect(s.slides[0].boxes[1].text).toHaveLength(400);
    expect(s.slides[1].image).toBeUndefined();
    expect(s.slides[1].photo).toBeUndefined();
  });

  it("cuts lists to 10 slides and 6 boxes, pads to 2 slides and skips junk", () => {
    const many = { id: "ss1", slides: Array.from({ length: 14 }, (_, i) => ({ id: `s${i}`, boxes: Array.from({ length: 9 }, (_, k) => box({ id: `b${k}` })) })) };
    const [s, one] = sanitizeSlideshows([many, null, "x", { id: "ss2", slides: [{ id: "a", boxes: [] }] }, { id: "ss3", slides: [] }]);
    expect(s.slides).toHaveLength(10);
    expect(s.slides[0].boxes).toHaveLength(6);
    expect(s.size).toBe("4x5");
    expect(one.slides).toHaveLength(2);
    expect(sanitizeSlideshows("nope")).toEqual([]);
  });
});

describe("slides and boxes", () => {
  it("adds, duplicates, deletes and moves with unique ids, within 2 and 10", () => {
    let s = withSlides(10);
    expect(s.slides).toHaveLength(10);
    expect(addSlide(s, 0)).toBe(s);
    expect(duplicateSlide(s, 0)).toBe(s);
    s = deleteSlide(deleteSlide(s, 0), 0);
    s = duplicateSlide(s, 1);
    expect(s.slides).toHaveLength(9);
    expect(s.slides[2].boxes[0].text).toBe(s.slides[1].boxes[0].text);
    expect(unique(allIds(s))).toBe(true);
    const order = ids(s);
    expect(ids(moveSlide(s, 0, 1)).slice(0, 2)).toEqual([order[1], order[0]]);
    expect(moveSlide(s, 0, -1)).toBe(s);
    let two = blankSlideshow();
    expect(deleteSlide(two, 0)).toBe(two);
    for (let i = 0; i < 8; i++) two = addBox(two, two.slides[0].id, makeBox("more"));
    expect(two.slides[0].boxes).toHaveLength(6);
    expect(unique(allIds(two))).toBe(true);
  });

  it("changes and deletes one box, clamping what it is given", () => {
    const s = blankSlideshow();
    const slide = s.slides[0];
    const b = slide.boxes[0];
    const moved = changeBox(s, slide.id, b.id, { x: 2, size: 4, text: "New words" });
    expect(moved.slides[0].boxes[0]).toMatchObject({ x: 1, size: 16, text: "New words" });
    expect(deleteBox(moved, slide.id, b.id).slides[0].boxes).toEqual([]);
  });

  it("apply to all changes style keys on every box and never the words", () => {
    let s = fromPost("Three things.\n\nFirst point here.\n\nSecond point here.\n\nThird point here.");
    const words = s.slides.map((x) => x.boxes.map((b) => [b.text, b.x, b.y]));
    s = applyToAll(s, { font: "serif", color: "#ff0000", bg: "bar", text: "hacked", x: 0.1, id: "z" });
    for (const b of s.slides.flatMap((x) => x.boxes)) expect(b).toMatchObject({ font: "serif", color: "#ff0000", bg: "bar" });
    expect(s.slides.map((x) => x.boxes.map((b) => [b.text, b.x, b.y]))).toEqual(words);
    expect(applyToAll(s, { font: "comic" }).slides[0].boxes[0].font).toBe("serif");
  });
});

describe("fromPost", () => {
  it("turns a 5-point post into a cover, the points and a call to action", () => {
    const post = [
      "5 CPF moves for your 30s",
      "1. Top up your SA early. The interest compounds for longer.",
      "2. Check your MediSave balance. It pays for more than you think.",
      "3. Know your retirement sum. Plan towards it, not past it.",
      "4. Use the housing grant wisely. It comes back to your CPF later.",
      "5. Review your nominations. They don't update themselves.",
      "Follow for more CPF tips.",
    ].join("\n\n");
    const s = fromPost(post, { style: { font: "heavy", size: 90 } });
    expect(s.slides).toHaveLength(7);
    expect(s.title).toBe("5 CPF moves for your 30s");
    expect(s.slides[0].boxes[0].text).toBe("5 CPF moves for your 30s");
    expect(s.slides[0].boxes[0].font).toBe("heavy");
    expect(s.slides[0].boxes[0].size).toBe(60);
    expect(s.slides[1].boxes.map((b) => b.text).join(" ")).toContain("Top up your SA early");
    expect(s.slides[6].boxes.map((b) => b.text).join(" ")).toContain("Follow for more CPF tips");
    expect(s.slides.every((x) => !x.image && !x.photo)).toBe(true);
    expect(unique(allIds(s))).toBe(true);
  });

  it("gives a blank slideshow for empty text", () => {
    expect(fromPost("   ").slides).toHaveLength(2);
  });

  it("uses the hook as the cover when the text is only a call to action", () => {
    const s = fromPost("Save this for your next CPF review. Comment INFO below.", { hook: "Three CPF moves" });
    expect(s.slides[0].boxes[0].text).toBe("Three CPF moves");
  });
});

describe("undo history", () => {
  it("keeps 20 steps and walks back and forward", () => {
    let h = emptyHistory();
    const versions = Array.from({ length: 25 }, (_, i) => ({ ...blankSlideshow(), title: `v${i}` }));
    versions.slice(0, 24).forEach((v, i) => (h = remember(h, v, undefined, i * 5000)));
    expect(h.past).toHaveLength(MAX_HISTORY);
    let cur = versions[24];
    const seen: string[] = [];
    for (let r = undo(h, cur); r; r = undo(h, cur)) {
      h = r.h;
      cur = r.show;
      seen.push(cur.title);
    }
    expect(seen).toHaveLength(20);
    expect(seen[0]).toBe("v23");
    expect(seen[19]).toBe("v4");
    const back = redo(h, cur)!;
    expect(back.show.title).toBe("v5");
    expect(remember(back.h, cur).future).toEqual([]);
  });

  it("folds typing on one control within a second into one step", () => {
    const a = blankSlideshow();
    let h = remember(emptyHistory(), a, "text:b1", 1000);
    h = remember(h, a, "text:b1", 1500);
    h = remember(h, a, "text:b1", 2200);
    expect(h.past).toHaveLength(1);
    h = remember(h, a, "text:b2", 2300);
    h = remember(h, a, "text:b2", 4000);
    expect(h.past).toHaveLength(3);
  });
});

describe("load and save", () => {
  it("saves newest first under the synced key, keeps 20 and removes", () => {
    for (let i = 0; i < 22; i++) saveSlideshow("u1", { ...blankSlideshow(), id: `ss${i}`, title: `T${i}` }, new Date(2026, 9, 1, 0, i));
    const list = loadSlideshows("u1");
    expect(list).toHaveLength(20);
    expect(list[0]).toMatchObject({ id: "ss21", updatedAt: new Date(2026, 9, 1, 0, 21).toISOString() });
    expect([...store.keys()]).toContain("content-studio-slideshows-u1");
    expect(removeSlideshow("u1", "ss21")[0].id).toBe("ss20");
    expect(loadSlideshows(null)).toEqual([]);
  });

  it("remembers the last text style on this device only", () => {
    expect(loadStyleHint()).toEqual({});
    saveStyleHint({ font: "serif", size: 40, color: "#000000", stroke: 3, strokeColor: "#FFFFFF", bg: "none" });
    expect(loadStyleHint()).toMatchObject({ font: "serif", stroke: 3, bg: "none" });
    expect([...store.keys()]).toEqual(["cs-slideshow-style"]);
  });
});

describe("slideshowToDraft", () => {
  it("writes a carousel draft with the slide words, on TikTok for 9:16", () => {
    const s = fromPost("Cover line here\n\nOne thing to know.\n\nAnother thing to know.");
    const d = slideshowToDraft({ ...s, draftId: "d1" }, "2026-10-20T00:00:00.000Z");
    expect(d).toMatchObject({ id: "d1", format: "carousel", platform: "instagram", hook: s.title, createdAt: "2026-10-20T00:00:00.000Z" });
    expect(d.draft).toContain("One thing to know");
    expect(d.draft.split("\n\n")).toHaveLength(s.slides.length);
    expect(slideshowToDraft({ ...s, size: "9x16" }, "").platform).toBe("tiktok");
    expect(slideshowToDraft(s, "").id).toBeTruthy();
  });
});

describe("links.slideshow", () => {
  it("leaves defaults out", () => {
    expect(links.slideshow()).toBe("/slideshow");
    expect(links.slideshow({ s: "ss1" })).toBe("/slideshow?s=ss1");
    expect(links.slideshow({ s: "ss1", slide: 1 })).toBe("/slideshow?s=ss1");
    expect(links.slideshow({ s: "ss1", slide: 4, panel: "text", box: "b2" })).toBe("/slideshow?s=ss1&slide=4&panel=text&box=b2");
    expect(links.slideshow({ s: "ss1", view: "original" })).toBe("/slideshow?s=ss1&view=original");
  });
});

describe("ago", () => {
  it("says how long since a save", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    expect(ago("2026-10-20T11:59:40Z", now)).toBe("just now");
    expect(ago("2026-10-20T11:55:00Z", now)).toBe("5 min ago");
    expect(ago("2026-10-20T10:00:00Z", now)).toBe("2 hr ago");
    expect(ago("2026-10-19T11:00:00Z", now)).toBe("1 day ago");
    expect(ago("2026-10-17T12:00:00Z", now)).toBe("3 days ago");
    expect(ago("", now)).toBe("just now");
  });
});
