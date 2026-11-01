import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import VideoEmbed from "./VideoEmbed";

// The player before a tap: nothing third-party loads, only the button (and the post's cover behind it when there is one).
const draw = (props: Parameters<typeof VideoEmbed>[0]) => renderToStaticMarkup(createElement(VideoEmbed, props));
const TT = "https://www.tiktok.com/@structured.app/video/7649417658676333857";

describe("VideoEmbed before a tap", () => {
  it("shows the cover behind the play button, and loads no player", () => {
    const html = draw({ url: TT, poster: "https://p16-sign-sg.tiktokcdn.com/c.jpeg" });
    expect(html).toContain('src="https://p16-sign-sg.tiktokcdn.com/c.jpeg"');
    expect(html).toContain("Watch the video");
    expect(html).not.toContain("<iframe");
  });

  it("says what the caller names, a slideshow or a carousel, and the video when it names nothing", () => {
    expect(draw({ url: TT, text: "Watch the slideshow" })).toContain("Watch the slideshow");
    expect(draw({ url: TT, text: "Watch the slideshow" })).not.toContain("Watch the video");
    expect(draw({ url: TT })).toContain("Watch the video");
  });

  it("is the plain button with no cover, and nothing at all for a link no platform plays", () => {
    expect(draw({ url: TT })).not.toContain("<img");
    expect(draw({ url: "https://example.com/video/1" })).toBe("");
  });
});
