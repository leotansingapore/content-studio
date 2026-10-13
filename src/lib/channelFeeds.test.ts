import { describe, expect, it } from "vitest";
import { FEED_BASE, businessKey, canSeeChannelFeeds, fetchChannelFeeds, normalizeFeed, parseCaption } from "@/lib/channelFeeds";

const feed = {
  business: "MoneyBees",
  channel: "Telegram",
  handle: "@themoneybeesacademy",
  items: [
    { id: "a", date: "2026-10-14", time: "20:00", status: "locked", title: "Debt story", format: "story", kind: "guide",
      link: "https://themoneybees.co/blog/x", caption: "<b>Hi</b>", media: [`${FEED_BASE}m/1.jpg`, "https://evil.example/2.jpg"] },
    { id: "b", date: "14 Oct", status: "planned", title: "bad date" },
    { id: "c", date: "2026-10-15", status: "maybe", title: "bad status" },
    { id: "d", date: "2026-10-16", time: "8pm", status: "planned", title: "Quiz", link: "javascript:alert(1)",
      quiz: { question: "Q?", options: ["x", "y"], answer: 1, explain: "because" } },
  ],
};

describe("normalizeFeed", () => {
  it("keeps good items, drops malformed ones and foreign pictures", () => {
    const items = normalizeFeed(feed);
    expect(items.map((i) => i.id)).toEqual(["a", "d"]);
    expect(items[0].media).toEqual([`${FEED_BASE}m/1.jpg`]);
    expect(items[0]).toMatchObject({ business: "MoneyBees", channel: "Telegram", handle: "@themoneybeesacademy" });
    expect(items[1]).toMatchObject({ time: "", link: "", quiz: { answer: 1, options: ["x", "y"] } });
  });
  it("refuses a feed without a business or channel", () => {
    expect(normalizeFeed({ ...feed, business: "" })).toEqual([]);
    expect(normalizeFeed(null)).toEqual([]);
  });
});

describe("parseCaption", () => {
  it("keeps bold, https links and line breaks, and decodes entities", () => {
    const parts = parseCaption('<b>Debt &amp; you</b>\n\nRead <a href="https://themoneybees.co/blog/x?a=1&amp;b=2">here</a> \ud83d\udc1d');
    expect(parts).toEqual([
      { t: "text", s: "Debt & you", bold: true },
      { t: "br" },
      { t: "br" },
      { t: "text", s: "Read ", bold: false },
      { t: "link", s: "here", href: "https://themoneybees.co/blog/x?a=1&b=2", bold: false },
      { t: "text", s: " \ud83d\udc1d", bold: false },
    ]);
  });
  it("never makes a link of a non-https href and drops unknown tags", () => {
    expect(parseCaption('<a href="javascript:alert(1)">x</a><script>y</script>')).toEqual([
      { t: "text", s: "x", bold: false },
      { t: "text", s: "y", bold: false },
    ]);
  });
});

describe("businessKey and access", () => {
  it("matches names across sources", () => {
    expect(businessKey("MoneyBees")).toBe(businessKey("moneybees"));
    expect(businessKey("FINternship ")).toBe("finternship");
  });
  it("shows the feeds to the board owner only", () => {
    expect(canSeeChannelFeeds("tanjunsing@gmail.com")).toBe(true);
    expect(canSeeChannelFeeds("user@demo.com")).toBe(false);
    expect(canSeeChannelFeeds(null)).toBe(false);
  });
});

describe("fetchChannelFeeds", () => {
  it("loads every listed feed under the bucket and skips one that fails or sits elsewhere", async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      if (url.startsWith(`${FEED_BASE}index.json`))
        return { json: async () => ({ feeds: [{ url: `${FEED_BASE}a/feed.json` }, { url: `${FEED_BASE}b/feed.json` }, { url: "https://evil.example/feed.json" }] }) };
      if (url.startsWith(`${FEED_BASE}a/`)) return { json: async () => feed };
      throw new Error("down");
    }) as unknown as typeof fetch;
    const items = await fetchChannelFeeds(fake);
    expect(items.map((i) => i.id)).toEqual(["a", "d"]);
    expect(calls.some((c) => c.includes("evil.example"))).toBe(false);
  });
});
