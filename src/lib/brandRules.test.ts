import { describe, expect, it } from "vitest";
import { allowedLinks, applyBrandRules, avoidList, brandOffers, brandRulesLine, capEmoji, countEmoji, offerUrl } from "@/lib/brandRules";
import { MAX_AVOID_CHARS, sanitizeBrand } from "@/lib/carousel";
import { checkLimits, countHashtags, strayLinks } from "@/lib/platformCounters";

const offers = [
  { name: "Free retirement review", url: "adatan.sg/review" },
  { name: "Will writing guide", url: "https://adatan.sg/will" },
  { name: "Broken", url: "javascript:alert(1)" },
];

describe("offers", () => {
  it("keep only http(s) links, adding https:// to a bare site", () => {
    expect(offerUrl("adatan.sg/review")).toBe("https://adatan.sg/review");
    expect(offerUrl("http://adatan.sg")).toBe("http://adatan.sg");
    for (const bad of ["javascript:alert(1)", "mailto:a@b.sg", "ftp://x.sg", "not a link", "localhost", ""]) expect(offerUrl(bad)).toBeNull();
    expect(brandOffers({ offers })).toEqual([
      { name: "Free retirement review", url: "https://adatan.sg/review" },
      { name: "Will writing guide", url: "https://adatan.sg/will" },
    ]);
  });
  it("the brand kit keeps up to 5, as typed, and the two policies only when known", () => {
    const kit = sanitizeBrand({ offers: [...offers, ...offers, 7], emojiPolicy: "one", hashtagPolicy: "loads" });
    expect(kit.offers).toHaveLength(5);
    expect(kit.offers![2]).toEqual({ name: "Broken", url: "javascript:alert(1)" });
    expect(kit.emojiPolicy).toBe("one");
    expect(kit.hashtagPolicy).toBeUndefined();
    expect(sanitizeBrand({ hashtagPolicy: "few" }).hashtagPolicy).toBe("few");
  });
});

describe("the line the writer gets", () => {
  it("says each rule set and lists the offers' links", () => {
    const line = brandRulesLine({ offers, emojiPolicy: "none", hashtagPolicy: "few" });
    expect(line).toContain("Use no emoji at all.");
    expect(line).toContain("2 to 4 relevant hashtags");
    expect(line).toContain("Free retirement review: https://adatan.sg/review; Will writing guide: https://adatan.sg/will.");
    expect(line).not.toContain("javascript");
    expect(brandRulesLine({ emojiPolicy: "one", hashtagPolicy: "ten" })).toMatch(/one emoji at most.*10 hashtags at most/);
    expect(brandRulesLine({ hashtagPolicy: "none" })).toContain("Use no hashtags.");
    expect(brandRulesLine({})).toBe("");
    expect(brandRulesLine(null)).toBe("");
  });
  it("holds Instagram and TikTok to their 5 hashtags, whatever the kit allows", () => {
    expect(brandRulesLine({}, "instagram")).toContain("Use 5 hashtags at most.");
    expect(brandRulesLine(null, "tiktok")).toContain("Use 5 hashtags at most.");
    const ten = brandRulesLine({ hashtagPolicy: "ten" }, "instagram");
    expect(ten).toContain("Use 5 hashtags at most.");
    expect(ten).not.toContain("10 hashtags");
    expect(brandRulesLine({ hashtagPolicy: "few" }, "instagram")).toContain("2 to 4 relevant hashtags");
    expect(brandRulesLine({ hashtagPolicy: "none" }, "tiktok")).toContain("Use no hashtags.");
    expect(brandRulesLine({}, "linkedin")).toBe("");
    expect(brandRulesLine({ hashtagPolicy: "ten" }, "linkedin")).toContain("10 hashtags at most");
  });
});

describe("words the brand never uses", () => {
  it("are read from what was typed: commas or new lines, trimmed, once each", () => {
    expect(avoidList({ avoidWords: "cheapest, hustle\nbest plan, , Cheapest" })).toEqual(["cheapest", "hustle", "best plan"]);
    expect(avoidList({ avoidWords: "   " })).toEqual([]);
    expect(avoidList(null)).toEqual([]);
  });
  it("go to the writer, and the brand kit keeps them as typed up to its cap", () => {
    expect(brandRulesLine({ avoidWords: "cheapest, hustle" })).toContain("Never use these words or phrases: cheapest, hustle.");
    expect(brandRulesLine({ avoidWords: " , " })).toBe("");
    expect(sanitizeBrand({ avoidWords: "cheapest,\nhustle" }).avoidWords).toBe("cheapest,\nhustle");
    expect(sanitizeBrand({ avoidWords: "x".repeat(MAX_AVOID_CHARS + 50) }).avoidWords).toHaveLength(MAX_AVOID_CHARS);
    expect(sanitizeBrand({ avoidWords: ["cheapest"] }).avoidWords).toBeUndefined();
  });
});

describe("keeping the policies after writing", () => {
  it("counts emoji as the reader sees them", () => {
    expect(countEmoji("Plan 💰 now 👍🏽 and 👨‍👩‍👧 🇸🇬 1️⃣ ❤️")).toBe(6);
    expect(countEmoji("© 2026 AIA ™ #1 in 2 years")).toBe(0);
  });
  it("keeps the first emoji up to the cap and tidies the space left", () => {
    expect(capEmoji("✅ Top up early\n✅ Review yearly 💡", 0)).toBe("Top up early\nReview yearly");
    expect(capEmoji("Save 💰 now 👍🏽. Done 🇸🇬", 1)).toBe("Save 💰 now. Done");
    expect(capEmoji("No emoji here.  Two spaces stay", 0)).toBe("No emoji here.  Two spaces stay");
  });
  it("applies both policies, and leaves text alone without them", () => {
    const text = "Your CPF at 55 🔑\n\nDM me PLAN 👇\n\n#cpf #retirement #singapore #money #planning #sg";
    const out = applyBrandRules(text, { emojiPolicy: "one", hashtagPolicy: "few" });
    expect(countEmoji(out)).toBe(1);
    expect(countHashtags(out)).toBe(4);
    expect(out).toBe("Your CPF at 55 🔑\n\nDM me PLAN\n\n#cpf #retirement #singapore #money");
    expect(countHashtags(applyBrandRules(text, { hashtagPolicy: "none" }))).toBe(0);
    expect(applyBrandRules(text, {})).toBe(text);
    expect(applyBrandRules(text, null)).toBe(text);
  });
  it("cuts Instagram and TikTok posts to 5 hashtags, and a stricter policy still wins", () => {
    const text = "Your CPF at 55\n\n#cpf #retirement #singapore #money #planning #sg #fc #aia";
    expect(applyBrandRules(text, {}, "instagram")).toBe("Your CPF at 55\n\n#cpf #retirement #singapore #money #planning");
    expect(countHashtags(applyBrandRules(text, { hashtagPolicy: "ten" }, "tiktok"))).toBe(5);
    expect(countHashtags(applyBrandRules(text, { hashtagPolicy: "few" }, "instagram"))).toBe(4);
    expect(applyBrandRules(text, {}, "linkedin")).toBe(text);
    expect(applyBrandRules(text, null, "facebook")).toBe(text);
  });
});

describe("links that are not an offer", () => {
  it("are flagged once each, matching an offer whatever its tracking tags or www.", () => {
    const allowed = allowedLinks({ offers, instagram: "ada" }, {});
    expect(allowed).toContain("https://ig.me/m/ada");
    const text = "Book here: https://www.adatan.sg/review/?utm_source=instagram. Or https://ig.me/m/ada. Also https://randomfund.com/x and https://randomfund.com/x";
    expect(strayLinks(text, allowed)).toEqual(["https://randomfund.com/x"]);
    expect(checkLimits(text, "instagram", allowed).warnings).toEqual([{ level: "warn", message: "Not one of your offer links: https://randomfund.com/x" }]);
  });
  it("nothing is flagged when the kit has no offers", () => {
    expect(allowedLinks({ instagram: "ada" }, {})).toEqual([]);
    expect(checkLimits("See https://randomfund.com", "instagram", allowedLinks({}, {})).warnings).toEqual([]);
  });
  it("the DM links Brand kit built from the Analytics accounts are allowed, as Brand kit told the adviser to copy them", () => {
    const accounts = { instagram: { handle: "@ada.tan" }, facebook: { handle: "facebook.com/adatanfa" } };
    const allowed = allowedLinks({ offers }, accounts);
    expect(allowed).toEqual(expect.arrayContaining(["https://ig.me/m/ada.tan", "https://m.me/adatanfa"]));
    expect(strayLinks("DM me: https://ig.me/m/ada.tan or https://m.me/adatanfa", allowed)).toEqual([]);
  });
});
