import { describe, expect, it } from "vitest";
import { captionSentences, youtubeId } from "./logic";

describe("youtube links", () => {
  it("reads the id from every common link shape", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
      "youtube.com/watch?v=dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ?si=abc",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ?feature=share",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    ]) expect(youtubeId(url)).toBe("dQw4w9WgXcQ");
  });

  it("refuses other sites, look-alike hosts and bad ids", () => {
    for (const url of [
      "https://vimeo.com/123",
      "https://youtube.com.evil.sg/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/@channel",
      "not a link",
      42,
    ]) expect(youtubeId(url)).toBeNull();
  });
});

const payload = (items: unknown[], title = "Talk") => ({ tasks: [{ result: [{ title, items }] }] });
const item = (text: string, start_time: number, end_time: number) => ({ type: "youtube_subtitles", text, start_time, end_time });

describe("captions to sentences", () => {
  it("joins lines into sentences at punctuation and drops sound tags", () => {
    const r = captionSentences(payload([
      item("[Music]", 0, 2),
      item("Most people buy insurance", 2, 4),
      item("the wrong way round.", 4, 6),
      item("♪ ♪", 6, 7),
      item("Here's why.", 6.2, 7),
    ]));
    expect(r.title).toBe("Talk");
    expect(r.sentences).toEqual([
      { s: 2, e: 6, text: "Most people buy insurance the wrong way round." },
      { s: 6.2, e: 7, text: "Here's why." },
    ]);
    expect(r.duration).toBe(7);
  });

  it("breaks unpunctuated auto captions on a pause or at 20 seconds", () => {
    const lines = Array.from({ length: 12 }, (_, i) => item(`line ${i}`, i * 3, i * 3 + 3));
    lines.push(item("after a pause", 40, 42));
    const r = captionSentences(payload(lines));
    expect(r.sentences.map((x) => [x.s, x.e])).toEqual([[0, 18], [18, 36], [40, 42]]);
    for (const x of r.sentences) expect(x.e - x.s).toBeLessThanOrEqual(20);
  });

  it("keeps time moving forward when lines overlap and skips broken items", () => {
    const r = captionSentences(payload([item("One.", 0, 3), item("Two.", 2, 4), item("bad", 5, 5), { text: "x" }]));
    expect(r.sentences).toEqual([{ s: 0, e: 3, text: "One." }, { s: 3, e: 4, text: "Two." }]);
  });

  it("returns nothing for a video without captions", () => {
    expect(captionSentences({ tasks: [{ result: null }] })).toEqual({ title: "", duration: 0, sentences: [] });
    expect(captionSentences(null).sentences).toEqual([]);
  });
});
