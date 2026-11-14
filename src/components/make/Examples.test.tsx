import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Examples from "./Examples";

const html = (f: { slug: string; name: string; examples?: number; sound?: true }) => renderToStaticMarkup(createElement(Examples, { f, card: "w-36" }));

describe("a format's examples", () => {
  it("shows every clip the format has, each with its poster and controls", () => {
    const page = html({ slug: "street", name: "Street interview", examples: 3 });
    expect(page).toContain(">Examples</p>");
    expect([...page.matchAll(/<video[^>]*src="([^"]+)"/g)].map((m) => m[1])).toEqual(["/formats/street.mp4", "/formats/street-2.mp4", "/formats/street-3.mp4"]);
    expect(page).toContain('poster="/formats/street-3.webp"');
    expect(page.match(/controls=""/g)).toHaveLength(3);
    expect(page).toContain('aria-label="Street interview example 2"');
    expect(html({ slug: "street", name: "Street interview" })).toContain(">Example</p>");
  });

  it("offers Play with sound under each clip only when the clips carry sound", () => {
    expect(html({ slug: "street", name: "Street interview", examples: 2, sound: true }).match(/Play with sound/g)).toHaveLength(2);
    expect(html({ slug: "clay", name: "Clay" })).not.toContain("Play with sound");
  });
});
