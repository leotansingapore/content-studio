import { describe, expect, it } from "vitest";
import { handleOf, hex, parseWritten, pickColour, privateIp, readSite, siteUrl } from "./logic";

const BASE = new URL("https://www.acme.sg/");
const PAGE = `<!doctype html><html><head>
<title>Acme Wealth | Plans for young families</title>
<meta property="og:site_name" content="Acme Wealth">
<meta name="description" content="Insurance and savings plans for young families in Singapore.">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/touch-180.png" sizes="180x180">
<meta property="og:image" content="https://cdn.acme.sg/share.jpg">
<style>.btn{background:#1f6feb;color:#fff}.hero{border-color:#1f6feb}.x{color:#777777}</style>
</head><body>
<img class="site-logo" src="/img/acme-logo.png" alt="Acme">
<img src="/svg/mark.svg" alt="logo">
<script>var secret = "do not read me"</script>
<h1>Plans for young families</h1><p>We help parents &amp; kids save.</p>
<a href="https://www.instagram.com/acmewealth/">IG</a>
<a href="https://instagram.com/p/Cxyz">a post</a>
<a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a>
<a href="https://facebook.com/AcmeWealthSG">FB</a>
<a href="https://www.linkedin.com/company/acme-wealth">LI</a>
<a href="https://www.tiktok.com/@acme.wealth">TT</a>
</body></html>`;

describe("reading a brand's home page", () => {
  it("finds the name, words, logos in order and the brand colour", () => {
    const s = readSite(PAGE, BASE);
    expect(s.name).toBe("Acme Wealth");
    expect(s.description).toBe("Insurance and savings plans for young families in Singapore.");
    expect(s.logos).toEqual([
      "https://www.acme.sg/touch-180.png",
      "https://www.acme.sg/img/acme-logo.png",
      "https://www.acme.sg/favicon-32.png",
      "https://cdn.acme.sg/share.jpg",
    ]);
    expect(s.colour).toBe("#1f6feb"); // a white theme-color says nothing; the markup's colour wins
    expect(s.text).toContain("We help parents & kids save.");
    expect(s.text).not.toContain("do not read me");
  });

  it("keeps profile links and skips share buttons and single posts", () => {
    expect(readSite(PAGE, BASE).handles).toEqual({ instagram: "acmewealth", facebook: "AcmeWealthSG", linkedin: "company/acme-wealth", tiktok: "acme.wealth" });
    expect(handleOf("instagram", "https://www.instagram.com/reel/abc/")).toBe("");
    expect(handleOf("facebook", "https://www.facebook.com/profile.php?id=1")).toBe("");
    expect(handleOf("tiktok", "https://www.tiktok.com/discover")).toBe("");
    expect(handleOf("linkedin", "https://www.linkedin.com/shareArticle?url=x")).toBe("");
  });

  it("falls back to the title, then the host, for a name", () => {
    expect(readSite("<title>Bee Clinic - Family GP</title>", BASE).name).toBe("Bee Clinic");
    expect(readSite("<p>hi</p>", BASE).name).toBe("acme.sg");
  });

  it("uses a theme-color that is a colour, and finds none on a grey page", () => {
    expect(pickColour("#E91E63", "")).toBe("#e91e63");
    expect(pickColour("", "<style>a{color:#333}b{color:#eeeeee}</style>")).toBeNull();
    expect(hex("#abc")).toBe("#aabbcc");
    expect(hex("red")).toBeNull();
  });
});

describe("the address", () => {
  it("adds https:// and refuses anything inside a network", () => {
    expect(siteUrl("acme.sg")?.href).toBe("https://acme.sg/");
    expect(siteUrl("http://acme.sg/about")?.href).toBe("http://acme.sg/about");
    for (const bad of ["localhost", "http://127.0.0.1", "http://10.0.0.5/", "https://intranet.corp", "https://acme.sg:8443", "ftp://acme.sg", "javascript:alert(1)", 5]) {
      expect(siteUrl(bad), String(bad)).toBeNull();
    }
  });
});

describe("what the LLM writes", () => {
  it("trims each field, swaps dashes, and drops junk", () => {
    const w = parseWritten(JSON.stringify({ name: " Acme ", oneLiner: "We help parents — save", audienceDetail: "x".repeat(300), topics: ["Savings", "", 3, "Kids"], edge: "e", voice: "v" }))!;
    expect(w).toMatchObject({ name: "Acme", oneLiner: "We help parents , save", topics: ["Savings", "Kids"] });
    expect(w.audienceDetail).toHaveLength(160);
    expect(parseWritten("not json")).toBeNull();
  });
});

describe("addresses a host resolves to", () => {
  it("refuses anything inside a network", () => {
    for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
      "224.0.0.1", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "ff02::1", "nonsense"]) {
      expect(privateIp(a), a).toBe(true);
    }
  });
  it("lets public addresses through", () => {
    for (const a of ["8.8.8.8", "172.32.0.1", "100.128.0.1", "151.101.1.69", "2606:4700::6810:84e5", "2a00:1450:4001::200e"]) expect(privateIp(a), a).toBe(false);
  });
});
