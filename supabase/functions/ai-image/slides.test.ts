import { describe, expect, it } from "vitest";
import { EXPLAINER_LOOKS } from "../ai-video/logic";
import { PEOPLE_RULE } from "./logic";
import { MAX_SLIDE_PICTURES, parseSlides, slidePictureBody } from "./slides";

describe("slideshow AI pictures", () => {
  it("takes 1 to 10 described pictures in a known look and shape, and nothing else", () => {
    expect(parseSlides({ pictures: [" calm  desk ", "a planner"], look: "clay", aspect: "9:16" })).toEqual({ ok: true, request: { pictures: ["calm desk", "a planner"], look: "clay", aspect: "9:16" } });
    for (const bad of [
      { pictures: [], look: "clay", aspect: "9:16" },
      { pictures: Array(MAX_SLIDE_PICTURES + 1).fill("a desk"), look: "clay", aspect: "9:16" },
      { pictures: ["ok desk", "x"], look: "clay", aspect: "9:16" },
      { pictures: ["ok desk", 4], look: "clay", aspect: "9:16" },
      { pictures: ["ok desk"], look: "anime", aspect: "9:16" },
      { pictures: ["ok desk"], look: "clay", aspect: "16:9" },
      null,
    ]) expect(parseSlides(bad).ok).toBe(false);
  });

  it("draws every slide in the look's style, with the people rule and no words, at the slideshow's shape", () => {
    const body = slidePictureBody("a calm desk on Sunday", "comic", "3:4");
    expect(body.prompt).toContain("A picture of a calm desk on Sunday.");
    expect(body.prompt).toContain(EXPLAINER_LOOKS.comic.style);
    expect(body.prompt).not.toContain(EXPLAINER_LOOKS.photo.style);
    expect(body.prompt).toContain("No text, no words");
    expect(body).toMatchObject({ aspect_ratio: "3:4", resolution: "1080p", batch_size: 1 });
    expect(slidePictureBody("a desk", "photo", "9:16").prompt).toContain(PEOPLE_RULE);
  });
});
