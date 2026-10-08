import { describe, expect, it } from "vitest";
import { decode, parseFeed, safeFeedUrl } from "./logic";

describe("safeFeedUrl", () => {
  it("allows ordinary feed addresses", () => {
    expect(safeFeedUrl("https://www.mas.gov.sg/news/rss")?.href).toBe("https://www.mas.gov.sg/news/rss");
    expect(safeFeedUrl(" http://feeds.example.com/money.xml ")?.hostname).toBe("feeds.example.com");
  });

  it("refuses anything that could reach inside a network", () => {
    for (const bad of [
      "ftp://x.com/feed", "file:///etc/passwd", "https://127.0.0.1/feed", "https://169.254.169.254/latest/meta-data",
      "https://[::1]/feed", "https://10.0.0.5/rss", "https://localhost/feed", "https://db.internal/feed", "https://printer.local/x",
      "https://user:pw@example.com/feed", "https://example.com:8080/feed", "https://intranet/feed", "not a url", 42, "https://1.1.1.1.nip.io.arpa/x",
    ]) {
      expect(safeFeedUrl(bad), String(bad)).toBeNull();
    }
  });
});

describe("parseFeed", () => {
  const rss = `<?xml version="1.0"?><rss><channel><title>MAS &amp; you</title>
    <item><title><![CDATA[CPF rates hold for Q4]]></title><link>https://news.example.sg/cpf-q4</link>
      <pubDate>Tue, 30 Sep 2026 02:00:00 GMT</pubDate><description>&lt;p&gt;Rates stay at 4%.&lt;/p&gt;</description></item>
    <item><title>Older story</title><link>/older</link><pubDate>Mon, 01 Sep 2026 02:00:00 GMT</pubDate></item>
    <item><title>No link</title></item>
  </channel></rss>`;

  it("reads RSS items newest first, with plain-text summaries and absolute links", () => {
    const f = parseFeed(rss, "https://news.example.sg/rss");
    expect(f.title).toBe("MAS & you");
    expect(f.items).toEqual([
      { title: "CPF rates hold for Q4", link: "https://news.example.sg/cpf-q4", date: "2026-09-30T02:00:00.000Z", summary: "Rates stay at 4%." },
      { title: "Older story", link: "https://news.example.sg/older", date: "2026-09-01T02:00:00.000Z", summary: "" },
    ]);
  });

  it("reads Atom entries and their alternate link", () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Blog</title>
      <entry><title>Budget 2027 ideas</title><link rel="self" href="https://b.sg/self"/><link rel="alternate" href="https://b.sg/budget"/>
      <updated>2026-10-01T09:00:00Z</updated><summary type="html">Five &#8216;quick&#8217; points</summary></entry></feed>`;
    expect(parseFeed(atom, "https://b.sg/atom").items[0]).toEqual({ title: "Budget 2027 ideas", link: "https://b.sg/budget", date: "2026-10-01T09:00:00.000Z", summary: "Five ‘quick’ points" });
  });

  it("gives nothing for a page that isn't a feed, and drops javascript links", () => {
    expect(parseFeed("<html><body>Hello</body></html>", "https://x.sg").items).toEqual([]);
    expect(parseFeed(`<rss><item><title>Bad</title><link>javascript:alert(1)</link></item></rss>`, "https://x.sg").items).toEqual([]);
    expect(decode("&amp;lt;b&amp;gt;")).toBe("&lt;b&gt;");
  });
});
