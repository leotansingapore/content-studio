// SlideFields is the one slide editor everyone's carousels use: its From media picker must draw for everyone else
// exactly as it did before media sets (pinned on today's code).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import SlideFields from "./SlideFields";
import type { MediaItem } from "@/lib/mediaLibrary";

const photo = (n: number, folder = ""): MediaItem => ({ key: `cimg-pic00${n}`, name: `Photo ${n}`, folder, alt: `Alt ${n}`, width: 1080, height: 1080, addedAt: `2026-10-0${n}T00:00:00.000Z` });
const noop = () => undefined;
const html = (media: MediaItem[] | null) =>
  renderToStaticMarkup(
    createElement(MemoryRouter, null,
      createElement(SlideFields, {
        slide: { id: "s1", title: "Hook", body: "Text" }, label: "Slide 1", role: "cover", flags: [], busy: false, overflow: false,
        picture: undefined, pictureMissing: false, media, onEdit: noop, onPicture: noop, onMedia: noop, onPickMedia: noop, onRemovePicture: noop,
      }),
    ),
  );

describe("SlideFields' From media picker for everyone else", () => {
  it("draws the photos grid as before", () => {
    expect(html([photo(1, "Money and budgeting"), photo(2), photo(3, "AI images")]).match(/<div class="rounded-lg border border-border\/60 p-2">.*?<\/ul><\/div>/)?.[0]).toBe(
      '<div class="rounded-lg border border-border/60 p-2"><ul class="grid max-h-48 grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-6">' +
        [1, 2, 3].map((n) => `<li><button type="button" title="Photo ${n}" aria-label="Use Photo ${n}" class="block aspect-square w-full overflow-hidden rounded-md border border-border/70 bg-muted hover:border-primary disabled:opacity-40"></button></li>`).join("") +
        "</ul></div>",
    );
  });
  it("says the library is empty as before, and draws nothing while closed", () => {
    expect(html([])).toContain('<p class="text-xs text-muted-foreground">No photos in Media yet. <a class="font-semibold text-primary hover:underline" href="/media">Add some</a></p>');
    expect(html(null)).not.toContain("grid-cols-4");
  });
});
