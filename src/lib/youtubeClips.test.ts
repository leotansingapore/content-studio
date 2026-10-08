import { describe, expect, it } from "vitest";
import { clipText, clipWriteUrl, watchUrl } from "@/lib/youtubeClips";

const sentences = [
  { s: 0, e: 4, text: "Intro." },
  { s: 4, e: 10, text: "Most people buy insurance backwards." },
  { s: 10, e: 18, text: "Start with what you can't afford to lose." },
  { s: 18, e: 25, text: "Outro." },
];

describe("youtube clips", () => {
  it("takes only the sentences inside the clip", () => {
    expect(clipText(sentences, { start: 4, end: 18, title: "", hook: "" })).toBe(
      "Most people buy insurance backwards. Start with what you can't afford to lose.",
    );
  });

  it("links to the clip's start and briefs Write with the words and a credit line", () => {
    expect(watchUrl("dQw4w9WgXcQ", 64.8)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=64s");
    const url = clipWriteUrl({ videoId: "dQw4w9WgXcQ", title: "Money talk" }, { start: 4, end: 18, title: "Buy it backwards", hook: "", text: "Most people buy insurance backwards." });
    const p = new URLSearchParams(url.split("?")[1]);
    expect(url.startsWith("/generate?")).toBe(true);
    expect(p.get("detail")).toBe("Buy it backwards");
    expect(p.get("ctx")).toContain('"Money talk" (https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=4s)');
    expect(p.get("ctx")).toContain('What\'s said: "Most people buy insurance backwards."');
    expect(p.get("ctx")).toContain("credit the speaker");
  });
});
