import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FORMATS } from "@/data/formats";
import FormatTile, { LOOK_COLOURS, tileOf } from "./FormatTile";

const bySlug = (slug: string) => FORMATS.find((f) => f.slug === slug)!;

describe("a video format card's drawn tile", () => {
  it("shows what the format puts on screen", () => {
    expect(tileOf(bySlug("talking-head")).motif).toBe("person");
    expect(tileOf(bySlug("template-two-host-podcast")).motif).toBe("duo");
    expect(tileOf(bySlug("wall-of-text")).motif).toBe("words");
    expect(tileOf(bySlug("slideshow")).motif).toBe("slides");
    expect(tileOf(bySlug("text-post")).motif).toBe("page");
    expect(tileOf(bySlug("meme")).motif).toBe("picture");
    expect(tileOf(bySlug("clips")).motif).toBe("footage");
  });

  it("gives every animated story its own look's colours, and the singing ad a character in theme tokens", () => {
    const looks = FORMATS.filter((f) => f.section === "animated" && f.slug.startsWith("look-"));
    expect(looks.length).toBeGreaterThan(0);
    for (const f of looks) expect(tileOf(f), f.slug).toEqual({ motif: "character", colours: LOOK_COLOURS[f.slug.slice(5)] });
    expect(new Set(looks.map((f) => tileOf(f).colours!.join())).size).toBe(looks.length);
    expect(tileOf(bySlug("template-singing-ad"))).toEqual({ motif: "character", colours: undefined });
  });

  it("draws three frames, in the look's colours for a story and in theme tokens otherwise", () => {
    const clay = renderToStaticMarkup(<FormatTile f={bySlug("look-clay")} />);
    expect(clay.match(/<clipPath/g)).toHaveLength(3);
    expect(clay).toContain(LOOK_COLOURS.clay[0]);
    const head = renderToStaticMarkup(<FormatTile f={bySlug("talking-head")} />);
    expect(head).toContain("hsl(var(--primary))");
    expect(head).not.toMatch(/#[0-9A-F]{6}/i);
  });
});
