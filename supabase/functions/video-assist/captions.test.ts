import { describe, expect, it } from "vitest";
import { PLATFORM_RULES, buildCaptionsMessages, capHashtags, ctaLine, fitThreads, fitX, keywordCandidates, xParts, keywordQuestion, parseCaptionsReply, parseCaptionsRequest, readKeyword } from "./captions";
import { countHashtags } from "../../../src/lib/platformCounters";

const talk = "Most people think their company insurance is enough. I reviewed 40 young families this year.";

describe("captions request", () => {
  it("needs what is said; the Instagram caption and title are optional", () => {
    const r = parseCaptionsRequest({ transcript: ` ${talk} `, instagram: "IG caption #cpf", title: "  Hospital   cover " });
    expect(r).toEqual({ ok: true, transcript: talk, instagram: "IG caption #cpf", title: "Hospital cover", rules: "" });
    expect(parseCaptionsRequest({ transcript: "too short" }).ok).toBe(false);
  });
  it("tells the writer each platform's shape and hashtag limit", () => {
    const [system, user] = buildCaptionsMessages(talk, "IG caption", "");
    for (const p of Object.values(PLATFORM_RULES)) expect(system.content).toContain(p.shape);
    expect(user.content).toContain("IG caption");
    expect(user.content).not.toContain("Video title");
  });
  it("passes the brand kit's rules line to the writer when one is sent", () => {
    const rules = "MY BRAND RULES (these win over any other emoji, hashtag or link guidance): Use no emoji at all.";
    const r = parseCaptionsRequest({ transcript: talk, rules: `${rules}\n` });
    expect(r.ok && r.rules).toBe(rules);
    expect(buildCaptionsMessages(talk, "", "", rules)[0].content).toContain(rules);
    expect(buildCaptionsMessages(talk, "", "")[0].content).not.toContain("BRAND RULES");
  });
});

describe("the limits", () => {
  it("keeps the first hashtags up to the limit and tidies the gap", () => {
    expect(capHashtags("Line one.\n\n#a #b #c #d", 2)).toBe("Line one.\n\n#a #b");
    expect(capHashtags("Check #cpf now #a #b", 1)).toBe("Check #cpf now");
    expect(capHashtags("No tags here", 3)).toBe("No tags here");
    expect(capHashtags("Line one.\n\n#a\n\nNext", 0)).toBe("Line one.\n\nNext");
    expect(capHashtags("Tip #x \nMore", 0)).toBe("Tip\nMore");
  });
  it("each platform's reply comes back inside its own limits, without em dashes", () => {
    const tags = (n: number) => Array.from({ length: n }, (_, i) => `#tag${i}`).join(" ");
    const out = parseCaptionsReply(JSON.stringify({ tiktok: `Short line — really ${tags(9)}`, linkedin: `Long post\n\n${tags(6)}`, facebook: `Post ${tags(4)}`, instagram: "ignored" }))!;
    expect(countHashtags(out.tiktok!)).toBe(5);
    expect(countHashtags(out.linkedin!)).toBe(3);
    expect(countHashtags(out.facebook!)).toBe(2);
    expect(out.tiktok).toMatch(/^Short line, really/);
    expect(Object.keys(out)).toEqual(["tiktok", "linkedin", "facebook"]);
    expect(parseCaptionsReply(JSON.stringify({ tiktok: "x".repeat(3000) }))!.tiktok).toHaveLength(2200);
    expect(parseCaptionsReply("nope")).toBeNull();
    expect(parseCaptionsReply("{}")).toBeNull();
  });
});

describe("YouTube, X and Threads", () => {
  const sentence = (n: number) => `Point ${n} is that your CPF payout at 65 depends on what you set aside in your 30s, and S$1.2 million is not the number most people need to retire well.`;
  it("X stays one post when it fits, else a numbered thread of up to 6 that never splits a sentence", () => {
    expect(fitX(["Short and sweet. #cpf"])).toBe("Short and sweet. #cpf");
    const thread = fitX([Array.from({ length: 5 }, (_, i) => sentence(i + 1)).join(" ")]);
    const parts = thread.split("\n\n");
    expect(parts.length).toBeGreaterThan(1);
    parts.forEach((p, i) => {
      expect(p.length).toBeLessThanOrEqual(280);
      expect(p.startsWith(`${i + 1}/${parts.length} `)).toBe(true);
      expect(p).toMatch(/\.$/);
    });
    expect(thread).toContain("S$1.2 million");
    expect(xParts(thread)).toEqual(parts);
    expect(xParts("One post\n\nwith a gap")).toEqual(["One post\n\nwith a gap"]);
    expect(fitX(Array.from({ length: 8 }, (_, i) => `${i + 1}/8 Part ${i + 1}.`)).split("\n\n")).toEqual(["1/6 Part 1.", "2/6 Part 2.", "3/6 Part 3.", "4/6 Part 4.", "5/6 Part 5.", "6/6 Part 6."]);
  });
  it("Threads keeps whole paragraphs under 500, and the YouTube title is cut at a word", () => {
    const para = "word ".repeat(40).trim();
    expect(fitThreads(`${para}\n\n${para}\n\n${para}`)).toBe(`${para}\n\n${para}`);
    const out = parseCaptionsReply({
      youtube_title: `${"Why your company insurance ".repeat(5)}is not enough`,
      youtube: "What I found. Link in the description. #cpf #insurance #family #sg",
      x: ["1/2 First post #a #b", "2/2 Second post #c"],
      threads: "Talk to me #one #two",
    })!;
    expect(out.youtubeTitle!.length).toBeLessThanOrEqual(100);
    expect(out.youtubeTitle).toMatch(/insurance Why your company$/);
    expect(countHashtags(out.youtube!)).toBe(3);
    expect(out.x).toBe("1/2 First post #a #b\n\n2/2 Second post");
    expect(countHashtags(out.threads!)).toBe(1);
  });
});

describe("the spoken keyword", () => {
  const said = "Most people skip this. If you want my checklist, comment PLAN below. Or DM me the word retire. Message me plan.";
  it("lists the words said after comment, DM, message or type, once each", () => {
    const cands = keywordCandidates(said);
    expect(cands.map((c) => c.word)).toEqual(["PLAN", "below", "me", "the", "word", "retire"]);
    expect(cands[0].verb).toBe("comment");
    expect(cands.find((c) => c.word === "retire")!.verb).toBe("dm");
    expect(keywordCandidates("Nothing to ask here at all.")).toEqual([]);
    expect(Object.keys(keywordQuestion(cands).keyword.criteria as object)).toEqual(["plan", "below", "me", "the", "word", "retire", "none"]);
  });
  it("Jev's pick is the keyword; none, no answer or a word not offered is no keyword", () => {
    const cands = keywordCandidates(said);
    expect(readKeyword({ keyword: { type: "choice", choice: "plan" } }, cands)).toEqual({ word: "PLAN", verb: "comment" });
    expect(readKeyword({ keyword: { type: "choice", choice: "none" } }, cands)).toBeNull();
    expect(readKeyword({ keyword: { type: "choice", choice: "money" } }, cands)).toBeNull();
    expect(readKeyword(null, cands)).toBeNull();
  });
  it("makes the first line, with what they get when the writer says", () => {
    expect(ctaLine({ word: "plan", verb: "comment" }, '{"cta_offer": "my CPF top-up checklist."}')).toBe(`Comment "PLAN" and I'll send you my CPF top-up checklist.`);
    expect(ctaLine({ word: "plan", verb: "comment" }, "{}")).toBe(`Comment "PLAN" below.`);
    expect(ctaLine({ word: "retire", verb: "dm" }, null)).toBe(`DM me "RETIRE".`);
  });
  it("tells the writer to leave the ask out and name the offer only when there is a keyword", () => {
    const [withKw] = buildCaptionsMessages(talk, "", "", "", { word: "plan", verb: "comment" });
    expect(withKw.content).toContain("comment the word PLAN");
    expect(withKw.content).toContain('"cta_offer"');
    expect(buildCaptionsMessages(talk, "", "")[0].content).not.toContain("cta_offer");
  });
});
