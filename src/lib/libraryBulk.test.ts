// The Library's Select: Delete goes through each store's own delete, keeps videos, and one Undo puts all of it back.
import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_FOLDER } from "@/lib/aiImage";
import { loadCarousels, saveCarousel, type SavedCarousel } from "@/lib/carousel";
import { loadDrafts, saveDrafts, type DraftEntry } from "@/lib/draftHistory";
import { blankImage, loadImages, saveImage } from "@/lib/images";
import { addMedia, loadMedia } from "@/lib/mediaLibrary";
import { blankSlideshow, loadSlideshows, saveSlideshow } from "@/lib/slideshow";
import type { VideoProject } from "@/lib/videoProjects";
import { brandDevice } from "@/test/brandDevice";
import { deleteItems, putBack, uniqueNames, type BulkStores } from "./libraryBulk";

vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", supabase: { auth: { getSession: () => new Promise(() => undefined) } } }));
afterEach(() => vi.unstubAllGlobals());

const U = "u1";
const draft = (id: string): DraftEntry => ({ id, createdAt: "2026-11-10T00:00:00Z", hook: `Hook ${id}`, draft: "x", pillar: "", pillarDetail: "", audience: "", format: "text-post", platform: "linkedin", ctaType: "" });
const carousel: SavedCarousel = { id: "c1", title: "Tips", platform: "instagram", slides: [{ id: "s1", title: "One", body: "two" }], updatedAt: "2026-11-09T00:00:00Z" };

function seed(): BulkStores {
  brandDevice(U);
  saveDrafts(U, [draft("p1"), draft("p2"), draft("video-pv"), draft("p3")]);
  saveSlideshow(U, { ...blankSlideshow(), id: "ss-tied", draftId: "p1" }, new Date("2026-11-08T00:00:00Z"));
  saveCarousel(U, carousel, new Date(carousel.updatedAt));
  saveImage(U, { ...blankImage({ layout: "us-vs-them" }), id: "img-abcd12" }, new Date("2026-11-07T00:00:00Z"));
  addMedia(U, { key: "cimg-abc123", name: "AI picture", folder: AI_FOLDER, alt: "", width: 1080, height: 1350, addedAt: "2026-11-06T00:00:00Z" });
  return {
    drafts: loadDrafts(U),
    carousels: loadCarousels(U),
    slideshows: loadSlideshows(U),
    projects: [{ id: "pv" } as VideoProject],
    media: loadMedia(U),
    designs: [],
    images: loadImages(U),
  };
}

describe("deleting what is selected", () => {
  it("deletes each card through its own store, a post with what is tied to it, and keeps videos", () => {
    const s = seed();
    const done = deleteItems(U, ["d:p1", "d:p3", "c:c1", "g:img-abcd12", "i:cimg-abc123", "v:pv", "d:video-pv"], s);
    expect(done.count).toBe(5);
    expect(done.videos).toBe(2);
    expect(loadDrafts(U).map((d) => d.id)).toEqual(["p2", "video-pv"]);
    // the slideshow tied to p1 went with its card, so it never comes back as a card of its own
    expect(loadSlideshows(U)).toEqual([]);
    expect(loadCarousels(U)).toEqual([]);
    expect(loadImages(U)).toEqual([]);
    expect(loadMedia(U)).toEqual([]);
  });

  it("puts every piece back with one Undo, the posts in their old places", () => {
    const s = seed();
    deleteItems(U, ["d:p1", "d:p3", "c:c1", "g:img-abcd12", "i:cimg-abc123"], s).undo();
    expect(loadDrafts(U).map((d) => d.id)).toEqual(["p1", "p2", "video-pv", "p3"]);
    expect(loadSlideshows(U).map((x) => [x.id, x.draftId])).toEqual([["ss-tied", "p1"]]);
    expect(loadCarousels(U).map((c) => [c.id, c.updatedAt])).toEqual([["c1", "2026-11-09T00:00:00.000Z"]]);
    expect(loadImages(U).map((g) => g.id)).toEqual(["img-abcd12"]);
    expect(loadMedia(U).map((m) => m.key)).toEqual(["cimg-abc123"]);
  });

  it("deletes nothing for a key it doesn't hold or a job", () => {
    const s = seed();
    expect(deleteItems(U, ["d:gone", "j:remix-1-0"], s).count).toBe(0);
    expect(loadDrafts(U)).toHaveLength(4);
  });
});

describe("helpers", () => {
  it("puts items back where they were among what is there now", () => {
    const before = ["a", "b", "c", "d"].map((id) => ({ id }));
    expect(putBack([{ id: "new" }, { id: "b" }, { id: "d" }], before, new Set(["a", "c"])).map((x) => x.id)).toEqual(["a", "new", "c", "b", "d"]);
  });

  it("names every file in the zip once", () => {
    const f = (name: string) => ({ file: new Blob([]), name });
    expect(uniqueNames([f("tips-01.png"), f("tips-01.png"), f("a.jpg")]).map((x) => x.name)).toEqual(["tips-01.png", "tips-01-2.png", "a.jpg"]);
  });
});
