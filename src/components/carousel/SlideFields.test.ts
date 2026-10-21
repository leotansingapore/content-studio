// SlideFields is the one slide editor everyone's carousels use: its From media picker must draw for everyone else
// exactly as it did before media sets (pinned on today's code).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import SlideFields from "./SlideFields";
import type { MediaItem } from "@/lib/mediaLibrary";

// "real" runs today's hook (nobody is Leo here); Leo's test swaps in his user
const as = vi.hoisted(() => ({ user: "real" as "real" | { id: string; email: string } }));
vi.mock("@/lib/useLeoOnly", async (actual) => {
  const real = await actual<typeof import("@/lib/useLeoOnly")>();
  return { ...real, useLeoUser: () => (as.user === "real" ? real.useLeoUser() : as.user) };
});
afterEach(() => {
  as.user = "real";
  vi.unstubAllGlobals();
});

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

describe("Leo's From media picker", () => {
  it("shows a chip for each photo set that has photos, never AI images", () => {
    as.user = { id: "u1", email: "leo@example.com" };
    const sets = [{ name: "Money and budgeting", kind: "photos" }, { name: "Empty set", kind: "photos" }, { name: "City clips", kind: "clips" }, { name: "AI images", kind: "photos" }];
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => (k === "cs-media-sets-u1" ? JSON.stringify(sets) : null), setItem: () => undefined } });
    const out = html([photo(1, "Money and budgeting"), photo(2), photo(3, "AI images"), photo(4, "City clips")]);
    const chips = [...out.matchAll(/<button type="button" aria-pressed="(true|false)"[^>]*>([^<]+)<\/button>/g)].map((m) => [m[2], m[1]]);
    expect(chips).toEqual([["All", "true"], ["Money and budgeting", "false"]]);
    expect(out).toContain('role="group" aria-label="Sets"');
    expect(out.match(/aria-label="Use Photo/g)).toHaveLength(4);
  });
  it("shows no chips when Leo has no sets", () => {
    as.user = { id: "u1", email: "leo@example.com" };
    expect(html([photo(1, "Money and budgeting")])).not.toContain('aria-label="Sets"');
  });
});
