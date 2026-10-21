import { describe, expect, it } from "vitest";
import {
  PLATFORM_RULES,
  THREAD_NETWORKS,
  buildCaptionsMessages,
  buildThreadMessages,
  capHashtags,
  ctaLine,
  fitThread,
  fitThreads,
  fitX,
  keywordCandidates,
  numbered,
  parseThreadReply,
  parseThreadRequest,
  sentencesOf,
  threadRoom,
  xParts,
  keywordQuestion,
  parseCaptionsReply,
  parseCaptionsRequest,
  readKeyword,
} from "./captions";
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
  it("X keeps a ratio or a 24/7 that opens a post, and still drops the writer's own thread numbers", () => {
    expect(fitX(["50/30/20 budgeting does not work in Singapore."])).toBe("50/30/20 budgeting does not work in Singapore.");
    expect(fitX(["24/7 claims help is what you pay an adviser for."])).toBe("24/7 claims help is what you pay an adviser for.");
    expect(fitX(["1/2 50/30/20 is a start.", "2/2 Then cut what you don't use."])).toBe("1/2 50/30/20 is a start.\n\n2/2 Then cut what you don't use.");
  });
  it("X captions come out exactly as they did before threads shared the splitter", () => {
    // pinned from fitX on 2026-10-21, before fitThread was pulled out of it
    const s = (n: number) => `Point ${n} is that your CPF payout at 65 depends on what you set aside in your 30s.`;
    const words = "Most people never check what their hospital plan pays for a private ward stay and they find out only when the bill arrives and the insurer pays less than the full amount because of the pro-ration factor that applies to a ward class above the plan";
    const pins: [string[], string][] = [
      [["Short and sweet. #cpf"], "Short and sweet. #cpf"],
      [["x".repeat(278)], "x".repeat(278)],
      [[`${"word ".repeat(56).trim()}.`], `${"word ".repeat(56).trim()}.`],
      [[[1, 2, 3, 4, 5].map(s).join(" ")], `1/2 ${[1, 2, 3].map(s).join(" ")}\n\n2/2 ${[4, 5].map(s).join(" ")}`],
      [["1/3 First.", "2/3 Second.", "3/3 Third."], "1/3 First.\n\n2/3 Second.\n\n3/3 Third."],
      [["", "  Part one.  ", "", "Part two."], "1/2 Part one.\n\n2/2 Part two."],
      [[`${Array(4).fill(words).join(" and ")}.`], `${words} and Most people never check`],
      [["A".repeat(276), "B short."], `1/2 ${"A".repeat(275)}\n\n2/2 B short.`],
      [["One.", "Two.", "Three.", "Four.", "Five.", "Six.", "Seven."], "1/6 One.\n\n2/6 Two.\n\n3/6 Three.\n\n4/6 Four.\n\n5/6 Five.\n\n6/6 Six."],
      [[`Line one.\nLine two.\n\nPara two. ${[1, 2, 3, 4].map(s).join(" ")}`], `1/2 Line one. Line two. Para two. ${[1, 2, 3].map(s).join(" ")}\n\n2/2 ${s(4)}`],
      [[], ""],
      [["   "], ""],
      [["2/2 Wrong order first.", "1/2 Then this."], "1/2 2/2 Wrong order first.\n\n2/2 1/2 Then this."],
    ];
    for (const [parts, out] of pins) expect(fitX(parts), JSON.stringify(parts).slice(0, 80)).toBe(out);
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
  it("never offers a spoken none as the keyword, so Jev's none stays no keyword", () => {
    const cands = keywordCandidates("Leave a comment if none of this was new to you.");
    expect(cands.map((c) => c.word)).not.toContain("none");
    expect(readKeyword({ keyword: { type: "choice", choice: "none" } }, cands)).toBeNull();
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

describe("a thread for Threads or X", () => {
  const sentence = (n: number) => `Point ${n}: your CPF payout at 65 depends on what you set aside in your 30s, and S$1.2 million is not the number most people need.`;
  const words = "Most people never check what their hospital plan pays for a private ward stay until the bill arrives and the insurer pays less than they thought";
  const long700 = `${Array(5).fill(words).join(" and ")}.`;

  it("keeps every post within the room, never breaks a sentence that fits, and stops at the most posts", () => {
    const part = Array.from({ length: 12 }, (_, i) => sentence(i + 1)).join(" ");
    const posts = fitThread([part], 495, 10);
    expect(posts.length).toBeGreaterThan(1);
    for (const p of posts) expect(p.length).toBeLessThanOrEqual(495);
    // each sentence sits whole inside one post
    for (let i = 1; i <= 12; i++) expect(posts.filter((p) => p.includes(sentence(i))).length).toBe(1);
    expect(fitThread(Array.from({ length: 12 }, (_, i) => `Post ${i + 1}.`), 495, 10)).toHaveLength(10);
  });
  it("cuts a 700-character sentence at a word", () => {
    expect(long700.length).toBeGreaterThan(700);
    const [first] = fitThread([long700], 495, 10);
    expect(first.length).toBeLessThanOrEqual(495);
    expect(long700.startsWith(first)).toBe(true);
    expect(long700[first.length]).toBe(" ");
    expect(sentencesOf(long700)).toEqual([long700]);
  });
  it("numbering keeps every post inside the network's limit", () => {
    const part = Array.from({ length: 30 }, (_, i) => sentence(i + 1)).join(" ");
    for (const n of ["threads", "x"] as const) {
      // "9/9 " fits the 5 spare; a tenth post's "10/10 " is one over, which the panel's counters show
      const posts = numbered(fitThread([part], threadRoom(n), 9));
      expect(posts[0]).toMatch(/^1\/9 /);
      for (const p of posts) expect(p.length).toBeLessThanOrEqual(THREAD_NETWORKS[n].max);
      const full = numbered(fitThread(Array(9).fill("a".repeat(threadRoom(n))), threadRoom(n), 9));
      for (const p of full) expect(p.length).toBeLessThanOrEqual(THREAD_NETWORKS[n].max);
    }
  });
  it("takes a post, Threads or X, and 3 to 8 posts when asked", () => {
    const post = "Most people pay for their hospital stay twice. First the premium, then the co-pay.";
    expect(parseThreadRequest({ post: ` ${post} `, network: "threads" })).toEqual({ ok: true, post, network: "threads", posts: null });
    expect(parseThreadRequest({ post, network: "x", posts: 5 })).toEqual({ ok: true, post, network: "x", posts: 5 });
    for (const bad of [{ post, network: "linkedin" }, { post, network: "x", posts: 2 }, { post, network: "x", posts: 9 }, { post, network: "x", posts: 4.5 }, { post: "Too short.", network: "x" }, { post: "a".repeat(5001), network: "x" }]) {
      expect(parseThreadRequest(bad).ok, JSON.stringify(bad).slice(0, 60)).toBe(false);
    }
  });
  it("tells the writer the network, the room, the house rules and to add no facts", () => {
    const [system, user] = buildThreadMessages("The post text.", "x", 5);
    expect(system.content).toContain("thread for X");
    expect(system.content).toContain("exactly 5 posts, each 275 characters or fewer");
    expect(system.content).toContain("add none");
    expect(system.content).toContain("guaranteed or risk-free");
    expect(system.content).toContain("never an em dash");
    expect(buildThreadMessages("The post text.", "threads")[0].content).toContain("3 to 8 posts, each 495 characters or fewer");
    expect(user.content).toBe("The post:\nThe post text.");
  });
  it("reads the reply: 3 to 8 posts within the room, hashtags only at the end, no dashes or numbers of its own", () => {
    const reply = (posts: string[]) => JSON.stringify({ posts });
    expect(parseThreadReply(reply(["One.", "Two."]), "threads")).toBeNull();
    expect(parseThreadReply(reply(Array.from({ length: 9 }, (_, i) => `Post ${i + 1}.`)), "threads")).toBeNull();
    expect(parseThreadReply("not json", "x")).toBeNull();
    const out = parseThreadReply(reply(["1/3 Most people pay twice #insurance", "2/3 First the premium \u2014 then the co-pay.", "3/3 Check your rider. #cpf #sg #money #more"]), "threads")!;
    expect(out).toEqual(["Most people pay twice", "First the premium, then the co-pay.", "Check your rider. #cpf #sg #money"]);
    // a post past the room is split between its sentences, which can take it past 8
    const fitted = parseThreadReply(reply(["Hook.", Array.from({ length: 8 }, (_, i) => sentence(i + 1)).join(" "), "Last."]), "x")!;
    expect(fitted.length).toBeGreaterThan(3);
    for (const p of fitted) expect(p.length).toBeLessThanOrEqual(275);
  });
});
