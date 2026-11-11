import { describe, expect, it } from "vitest";
import type { LibraryJob } from "./library";
import { madeBetween, pathOf, readyTitle } from "./madeToast";

const job = (kind: string, state: LibraryJob["state"], o: Partial<LibraryJob> = {}): LibraryJob => ({ kind, label: "Slideshow", format: "carousel", state, href: "/make/slideshow?source=x", ...o });
const kinds = (l: LibraryJob[]) => l.map((j) => j.kind);

describe("the made toast", () => {
  it("says a row that turned ready, once", () => {
    const join = job("join", "ready", { label: "Wall of text", format: "video", href: "/edit" });
    expect(kinds(madeBetween([job("wall", "working")], [join]))).toEqual(["join"]);
    expect(madeBetween([join], [join])).toEqual([]);
    expect(kinds(madeBetween([job("format-static-ad", "working")], [job("format-static-ad", "ready")]))).toEqual(["format-static-ad"]);
  });

  it("says a slideshow or picture that finished, but not one that failed, a video job that hands over to its join, or a remix", () => {
    expect(kinds(madeBetween([job("slideshow", "working")], []))).toEqual(["slideshow"]);
    expect(kinds(madeBetween([job("image", "working")], []))).toEqual(["image"]);
    expect(madeBetween([job("slideshow", "working")], [job("slideshow", "failed")])).toEqual([]);
    for (const k of ["ai", "wall", "montage", "remix-1-0", "export"]) expect(madeBetween([job(k, "working")], []), k).toEqual([]);
    // a paid video waiting on this device to be opened never ran, so it never finished
    expect(madeBetween([job("slideshow", "working", { waiting: true })], [])).toEqual([]);
  });

  it("leaves a Blitz deck's own slideshows to the deck, and says the deck once it is ready", () => {
    const deck = job("format-blitz", "working", { label: "Blitz deck", href: "/blitz" });
    expect(madeBetween([deck, job("slideshow", "working")], [deck])).toEqual([]);
    expect(kinds(madeBetween([deck], [{ ...deck, state: "ready" }]))).toEqual(["format-blitz"]);
  });

  it("reads like a sentence", () => {
    expect(readyTitle("Wall of text")).toBe("Your wall of text is ready");
    expect(readyTitle("Blitz deck")).toBe("Your blitz deck is ready");
    expect(pathOf("/make/slideshow?source=x#top")).toBe("/make/slideshow");
    expect(pathOf("/library#making")).toBe("/library");
  });
});
