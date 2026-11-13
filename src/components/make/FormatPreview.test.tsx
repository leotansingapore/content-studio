// FormatPreview: the poster first, and the clip only once the card nears the screen (13 Nov, Fastlane's moving cards).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FormatPreview from "./FormatPreview";

describe("FormatPreview", () => {
  it("draws the poster and loads no clip before the card is near the screen", () => {
    const out = renderToStaticMarkup(createElement(FormatPreview, { slug: "slideshow", video: true }));
    expect(out).toContain('src="/formats/slideshow.webp"');
    expect(out).not.toContain("<video");
    expect(out).not.toContain("Playing, muted");
  });

  it("takes another poster, as a static ad's example", () => {
    const out = renderToStaticMarkup(createElement(FormatPreview, { slug: "us-vs-them", poster: "/formats/static/us-vs-them-1.webp" }));
    expect(out).toContain('src="/formats/static/us-vs-them-1.webp"');
  });
});
