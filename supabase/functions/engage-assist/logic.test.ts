import { describe, expect, it } from "vitest";
import { REPLY_ANSWERS, SEND_TEN_SCRIPT } from "../../../src/data/recruitKit";
import {
  AUTOMATED_MIN,
  NOTE_MAX,
  SEND_TEN,
  buildConnectPrompt,
  readConnect,
  BATCH_SHARE_MAX,
  COMMENT_TYPES,
  MAX_POSTS,
  UNSORTED_TYPES,
  buildCommentsPrompt,
  readCommentTypes,
  readComments,
  typeQuestions,
  CLIENT_MIN,
  DM_KINDS,
  DM_GOALS,
  MAX_THREAD,
  buildThreadPrompt,
  readThread,
  buildDmsPrompt,
  dmQuestions,
  readDmKinds,
  readDmReplies,
  COMMENT_KINDS,
  HOUSE_ANSWERS,
  MAX_ITEMS,
  buildRepliesPrompt,
  cleanDraft,
  commentQuestions,
  jevReads,
  parseEngageRequest,
  readCommentKinds,
  readReplies,
  type CommentKind,
} from "./logic";
import type { JevAnswer } from "../_shared/jev";

const comments = [
  { name: "Tom", text: "So true!" },
  { name: "Ah Hock", text: "Mine went up too and I have no idea if I'm overpaying. How do I check?" },
  { name: "Linda88", text: "I made $5,000 last week trading, WhatsApp Mr Lim" },
  { name: "", text: "保险其实不贵。真正贵的是发现自己没有保障。" },
  { name: "Nadia", text: "🔥🔥" },
];

const choice = (choice: string, probabilities: Record<string, number>): JevAnswer => ({ type: "choice", choice, probabilities });

describe("parseEngageRequest", () => {
  it("takes the replies mode with trimmed comments and an optional post", () => {
    const r = parseEngageRequest({ mode: "replies", comments: [{ name: " Tom ", text: " So true! " }, { text: "  " }, "junk"] });
    expect(r).toEqual({ ok: true, request: { mode: "replies", post: "", comments: [{ name: "Tom", text: "So true!" }] } });
  });

  it("refuses no comments, too many, or an unknown mode", () => {
    expect(parseEngageRequest({ mode: "replies", comments: [] })).toMatchObject({ ok: false });
    const many = Array.from({ length: MAX_ITEMS + 1 }, () => ({ text: "Nice" }));
    expect(parseEngageRequest({ mode: "replies", comments: many })).toMatchObject({ ok: false });
    expect(parseEngageRequest({ mode: "post", comments })).toMatchObject({ ok: false });
    expect(parseEngageRequest(null)).toMatchObject({ ok: false });
  });
});

describe("sorting with Jev", () => {
  it("reads English and emoji-only comments, never text mostly in another script", () => {
    expect(jevReads("Wah mine also kena increase sia")).toBe(true);
    expect(jevReads("🔥🔥")).toBe(true);
    expect(jevReads(comments[3].text)).toBe(false);
    expect(Object.keys(commentQuestions(comments))).toEqual(["c0", "c1", "c2", "c4"]);
    const q = commentQuestions(comments).c1;
    expect(q.type).toBe("choice");
    expect(Object.keys((q as { criteria: object }).criteria)).toEqual([...COMMENT_KINDS]);
  });

  it("files a comment as a potential client from CLIENT_MIN up, even when another kind leads", () => {
    const answers = {
      c0: choice("support", { support: 1 }),
      c1: choice("substantive", { substantive: 1 - CLIENT_MIN, client: CLIENT_MIN }),
      c2: choice("noise", { noise: 0.8, client: CLIENT_MIN - 0.01, support: 0.19 }),
      c4: choice("bogus", { bogus: 1 }),
    };
    expect(readCommentKinds(answers, comments)).toEqual(["support", "client", "noise", "unsorted", "unsorted"]);
  });

  it("leaves every comment not sorted when Jev gives no answer", () => {
    expect(readCommentKinds(null, comments)).toEqual(Array(5).fill("unsorted"));
  });
});

describe("the drafts", () => {
  const kinds: CommentKind[] = ["support", "client", "noise", "unsorted", "support"];

  it("asks for every comment except noise, with its kind, and the house answers", () => {
    const { system, user } = buildRepliesPrompt("My post", comments, kinds);
    expect(user).toContain("[c1] client | Ah Hock:");
    expect(user).toContain("[c3] unsorted | (no name):");
    expect(user).not.toContain("c2");
    expect(system).toContain("How much can I earn?");
    expect(system).toMatch(/never name an insurer/i);
    expect(system).not.toMatch(/—/);
  });

  it("keeps the house answers identical to the recruit kit's", () => {
    expect(HOUSE_ANSWERS).toEqual(REPLY_ANSWERS);
  });

  it("comes back clients first, noise last and undrafted, a DM only for clients", () => {
    const content = JSON.stringify({
      replies: [
        { id: "c0", reply: "Thanks Tom." },
        { id: "c1", reply: "Ah Hock, start with the renewal letter — it shows which part rose. See https://x.co/a", dm: "Hi Ah Hock, here is the checklist: [link]" },
        { id: "c2", reply: "should never be used" },
        { id: "c3", reply: "谢谢" },
        { id: "c4", reply: "Thanks Nadia #grateful", dm: "not for support" },
      ],
    });
    const items = readReplies(content, comments, kinds);
    expect(items.map((x) => [x.i, x.kind])).toEqual([[1, "client"], [0, "support"], [4, "support"], [3, "unsorted"], [2, "noise"]]);
    expect(items[0]).toMatchObject({ reply: "Ah Hock, start with the renewal letter, it shows which part rose. See", dm: "Hi Ah Hock, here is the checklist: [link]" });
    expect(items[2]).toEqual({ ...comments[4], i: 4, kind: "support", reply: "Thanks Nadia" });
    expect(items[4]).toEqual({ ...comments[2], i: 2, kind: "noise", reply: null });
  });

  it("gives an empty draft for a missing reply or one that breaks a compliance rule", () => {
    const content = JSON.stringify({ replies: [{ id: "c1", reply: "Ah Hock, this plan is guaranteed to save you money.", dm: "Hi" }] });
    const items = readReplies(content, comments, kinds);
    expect(items.find((x) => x.i === 1)).toMatchObject({ reply: "", dm: "Hi" });
    expect(items.find((x) => x.i === 0)?.reply).toBe("");
    expect(readReplies("not json", comments, kinds).every((x) => x.reply === "" || x.reply === null)).toBe(true);
  });
});

describe("cleanDraft", () => {
  it("straightens quotes, drops dashes and hashtags, and cuts at a word", () => {
    expect(cleanDraft("“It’s fine” – really… #tips", 100)).toBe('"It\'s fine", really...');
    expect(cleanDraft("one two three four", 12)).toBe("one two");
    expect(cleanDraft("Line one\n\n\n\nLine  two", 100)).toBe("Line one\n\nLine two");
    expect(cleanDraft(42, 100)).toBe("");
  });

  it("keeps a link in a DM and takes it out of a public reply", () => {
    expect(cleanDraft("Here: https://a.co/x", 100)).toBe("Here: https://a.co/x");
    expect(cleanDraft("Here: www.a.co/x now", 100, { links: false })).toBe("Here: now");
  });
});

describe("direct messages", () => {
  const messages = [
    { name: "LeadGen Pro", text: "Hi, I noticed you're in financial services. Worth a quick call? calendly.com/x" },
    { name: "Karen", text: "How much would it cost to get my kids covered?" },
    { name: "Amanda", text: "I'm a recruiter at a bank with a wealth role. Open to a chat?" },
    { name: "", text: "你好，我想了解退休规划。" },
    { name: "Growth Agency", text: "Our agency is growing fast, better payout. Interested?" },
  ];
  const noul = (p: number): JevAnswer => ({ type: "noul", noul: p });

  it("takes the dms mode and refuses an empty paste", () => {
    expect(parseEngageRequest({ mode: "dms", messages: [{ text: " Hi " }] })).toEqual({ ok: true, request: { mode: "dms", messages: [{ name: "", text: "Hi" }], goal: "call" } });
    expect(parseEngageRequest({ mode: "dms", messages: [{ text: "Hi" }], goal: "guide" })).toMatchObject({ request: { goal: "guide" } });
    expect(parseEngageRequest({ mode: "dms", messages: [] })).toMatchObject({ ok: false });
  });

  it("asks a kind and an automated question per message Jev reads", () => {
    const q = dmQuestions(messages);
    expect(Object.keys(q)).toEqual(["k0", "a0", "k1", "a1", "k2", "a2", "k4", "a4"]);
    expect(Object.keys((q.k1 as { criteria: object }).criteria)).toEqual([...DM_KINDS]);
    expect(q.a1.type).toBe("noul");
  });

  it("flags a message as automated from AUTOMATED_MIN up, and leaves unread ones unsorted", () => {
    const answers = {
      k0: choice("spam", { spam: 1 }), a0: noul(0.97),
      k1: choice("lead", { lead: 1 }), a1: noul(0.2),
      k2: choice("recruiter", { recruiter: 1 }), a2: noul(AUTOMATED_MIN - 0.01),
      k4: choice("recruiter", { recruiter: 1 }), a4: noul(AUTOMATED_MIN),
    };
    expect(readDmKinds(answers, messages)).toEqual([
      { kind: "spam", automated: true },
      { kind: "lead", automated: false },
      { kind: "recruiter", automated: false },
      { kind: "unsorted", automated: false },
      { kind: "recruiter", automated: true },
    ]);
    expect(readDmKinds(null, messages).every((x) => x.kind === "unsorted" && !x.automated)).toBe(true);
  });

  it("drafts leads first and never spam or automated messages", () => {
    const sorted = readDmKinds(
      { k0: choice("spam", { spam: 1 }), a0: noul(0.97), k1: choice("lead", { lead: 1 }), k2: choice("recruiter", { recruiter: 1 }), k4: choice("recruiter", { recruiter: 1 }), a4: noul(0.9) },
      messages,
    );
    const { system, user } = buildDmsPrompt(messages, sorted);
    expect(user).toContain("[m1] lead | Karen:");
    expect(user).toContain("[m3] unsorted | (no name):");
    expect(user).not.toMatch(/\[m0\]|\[m4\]/);
    expect(system).toMatch(/never puts income or earnings figures in writing/);
    expect(system).toMatch(/\[time 1\] or \[time 2\], written exactly like that/);
    expect(system).toContain("How much can I earn?");
    const content = JSON.stringify({ replies: [{ id: "m0", reply: "no" }, { id: "m1", reply: "Karen, it depends on their ages. [time 1] or [time 2]?" }, { id: "m2", reply: "Amanda, thanks, not looking right now." }, { id: "m4", reply: "no" }] });
    const items = readDmReplies(content, messages, sorted);
    expect(items.map((x) => [x.i, x.kind, x.automated])).toEqual([[1, "lead", false], [2, "recruiter", false], [3, "unsorted", false], [0, "spam", true], [4, "recruiter", true]]);
    expect(items[0].reply).toBe("Karen, it depends on their ages. [time 1] or [time 2]?");
    expect(items[2].reply).toBe("");
    expect(items[3].reply).toBeNull();
    expect(items[4].reply).toBeNull();
  });
});

describe("DM goals", () => {
  const sorted = [{ kind: "lead" as const, automated: false }, { kind: "peer" as const, automated: false }];
  const msgs = [{ name: "Karen", text: "How much to cover my kids?" }, { name: "Wei", text: "Coffee next week?" }];
  const leadLine = (system: string) => system.split("\n").find((l) => l.startsWith("- lead"))!;

  it("steers a lead's draft to the goal picked, a call by default", () => {
    expect(leadLine(buildDmsPrompt(msgs, sorted).system)).toMatch(/15-minute call .*\[time 1\] or \[time 2\], written exactly like that/);
    const guide = leadLine(buildDmsPrompt(msgs, sorted, "guide").system);
    expect(guide).toContain("[guide link], written exactly like that");
    expect(guide).not.toContain("[time 1]");
    const rapport = leadLine(buildDmsPrompt(msgs, sorted, "rapport").system);
    expect(rapport).toMatch(/no ask and no pitch/);
    expect(rapport).not.toMatch(/\[time 1\]|\[guide link\]/);
  });

  it("takes any web address out of a DM draft: none was given, so it would be made up", () => {
    const items = readDmReplies(JSON.stringify({ replies: [{ id: "m0", reply: "Karen, here it is: https://made.up/guide [guide link]" }] }), msgs.slice(0, 1), sorted.slice(0, 1));
    expect(items[0].reply).toBe("Karen, here it is: [guide link]");
  });
});

describe("a conversation", () => {
  const lines = [
    { name: "Karen Tan", text: "Hi, saw your post on hospital plans", me: false },
    { name: "", text: "Thanks Karen. What made you look into it?", me: true },
    { name: "Karen Tan", text: "My dad's premium jumped", me: false },
    { name: "Karen Tan", text: "Is it worth keeping the rider?", me: false },
  ];

  it("takes the marked lines, keeps the last MAX_THREAD, and defaults the goal to a call", () => {
    const many = Array.from({ length: MAX_THREAD + 3 }, (_, i) => ({ text: `m${i}`, me: i % 2 === 1 }));
    const r = parseEngageRequest({ mode: "thread", lines: [...many, { text: " " }, null, { text: "last", me: "yes" }], goal: "nope" });
    expect(r.ok && r.request.mode === "thread" && r.request.lines.length).toBe(MAX_THREAD);
    expect(r).toMatchObject({ ok: true, request: { mode: "thread", goal: "call" } });
    expect(r.ok && r.request.mode === "thread" && r.request.lines.at(-1)).toEqual({ name: "", text: "last", me: false });
    expect(r.ok && r.request.mode === "thread" && r.request.lines[0].text).toBe("m4");
  });

  it("refuses an empty paste, and one where the last message is yours: no double text", () => {
    expect(parseEngageRequest({ mode: "thread", lines: [] })).toMatchObject({ ok: false });
    expect(parseEngageRequest({ mode: "thread", lines: [...lines, { text: "Any update?", me: true }] })).toEqual({ ok: false, error: "The last message is yours. Wait for their reply." });
  });

  it("shows the whole conversation oldest first, sides as marked, and keeps the DM rules for every goal", () => {
    for (const goal of DM_GOALS) {
      const { system, user } = buildThreadPrompt(lines, goal);
      expect(user).toBe(
        ["Their name: Karen Tan", "The conversation:", "Them: Hi, saw your post on hospital plans", "You: Thanks Karen. What made you look into it?", "Them: My dad's premium jumped", "Them: Is it worth keeping the rider?"].join("\n"),
      );
      expect(system).toMatch(/never puts income or earnings figures in writing/);
      expect(system).toMatch(/no booking or calendar link/);
      expect(system).toContain("never name an insurer, a fund or a product");
      expect(system).toContain("How much can I earn?");
    }
    expect(buildThreadPrompt(lines, "call").system).toMatch(/\[time 1\] or \[time 2\], written exactly like that/);
    expect(buildThreadPrompt(lines, "guide").system).toContain("[guide link], written exactly like that");
    expect(buildThreadPrompt(lines, "guide").system).not.toContain("[time 1]");
    expect(buildThreadPrompt(lines, "rapport").system).not.toMatch(/\[time 1\]|\[guide link\]/);
    expect(buildThreadPrompt(lines.map((l) => ({ ...l, name: "" })), "call").user.startsWith("The conversation:")).toBe(true);
  });

  it("reads one clean draft under their latest message, never a made-up address", () => {
    const item = readThread(JSON.stringify({ reply: "Karen, it depends on his plan \u2014 here: https://x.co/a [guide link]" }), lines);
    expect(item).toEqual({ name: "Karen Tan", text: "Is it worth keeping the rider?", i: 3, reply: "Karen, it depends on his plan, here: [guide link]" });
    expect(readThread("not json", lines).reply).toBe("");
    expect(readThread(JSON.stringify({ reply: "Guaranteed returns, Karen." }), lines).reply).toBe("");
  });
});

describe("comments on other people's posts", () => {
  const posts = [
    { name: "FinBro SG", text: "Whole life insurance is a waste of money. Buy term and invest the rest." },
    { name: "陈老师", text: "退休规划越早开始越好，很多人到五十岁才开始想。" },
  ];
  const probs = (p: Record<string, number>): JevAnswer => ({ type: "choice", choice: Object.entries(p).sort((a, b) => b[1] - a[1])[0][0], probabilities: p });

  it("takes 1 to MAX_POSTS posts", () => {
    expect(parseEngageRequest({ mode: "comments", posts: [{ name: "A", text: " Post " }] })).toEqual({ ok: true, request: { mode: "comments", posts: [{ name: "A", text: "Post" }] } });
    expect(parseEngageRequest({ mode: "comments", posts: [] })).toMatchObject({ ok: false });
    expect(parseEngageRequest({ mode: "comments", posts: Array(MAX_POSTS + 1).fill({ text: "x" }) })).toMatchObject({ ok: false });
  });

  it("asks each English post twice, the kinds in written and in reversed order", () => {
    const q = typeQuestions(posts);
    expect(Object.keys(q)).toEqual(["f0", "r0"]);
    expect(Object.keys((q.f0 as { criteria: object }).criteria)).toEqual([...COMMENT_TYPES]);
    expect(Object.keys((q.r0 as { criteria: object }).criteria)).toEqual([...COMMENT_TYPES].reverse());
  });

  it("takes the two likeliest kinds over both orders for one post, one each in a batch", () => {
    // written order leans question, reversed leans disagree: averaged, disagree leads
    const answers = { f0: probs({ question: 0.55, disagree: 0.28, number: 0.13, result: 0.04 }), r0: probs({ disagree: 0.6, question: 0.3, number: 0.06, result: 0.04 }) };
    expect(readCommentTypes(answers, [posts[0]])).toEqual([{ types: ["disagree", "question"], sorted: true }]);
    expect(readCommentTypes(answers, posts)).toEqual([
      { types: ["disagree"], sorted: true },
      { types: [UNSORTED_TYPES[0]], sorted: false },
    ]);
    expect(readCommentTypes({ f0: answers.f0 }, [posts[0]])).toEqual([{ types: UNSORTED_TYPES, sorted: false }]);
  });

  it("in a batch, uses no kind for more than BATCH_SHARE_MAX of the posts, the surest picks placed first", () => {
    const lean = (q: number, second: string): JevAnswer => probs({ question: q, [second]: 1 - q });
    const four = Array.from({ length: 4 }, (_, i) => ({ name: `A${i}`, text: `Post ${i}` }));
    const answers = Object.fromEntries(
      [lean(0.9, "number"), lean(0.6, "result"), lean(0.8, "disagree"), lean(0.7, "number")].flatMap((a, i) => [[`f${i}`, a], [`r${i}`, a]]),
    );
    const types = readCommentTypes(answers, four).map((x) => x.types[0]);
    expect(types).toEqual(["question", "result", "question", "number"]);
    expect(types.filter((t) => t === "question").length).toBeLessThanOrEqual(Math.ceil(4 * BATCH_SHARE_MAX));
  });

  it("asks for each kind per post and reads the drafts back in that order", () => {
    const picks = [{ types: ["disagree", "question"] as const, sorted: true }, { types: ["question"] as const, sorted: false }].map((x) => ({ ...x, types: [...x.types] }));
    const { system, user } = buildCommentsPrompt(posts, picks);
    expect(user).toContain("[p0] kinds: disagree, question | by FinBro SG");
    expect(user).toContain("[p1] kinds: question | by 陈老师");
    expect(system).toMatch(/never a figure of your own/);
    expect(system).toMatch(/Never runs down another adviser/);
    const content = JSON.stringify({
      comments: [
        { id: "p0", type: "question", text: "What return are you assuming on the invest-the-rest part?" },
        { id: "p0", type: "disagree", text: "Term fits most people \u2014 but not all. See https://x.co" },
        { id: "p1", type: "number", text: "wrong kind, dropped" },
      ],
    });
    expect(readComments(content, posts, picks)).toEqual([
      { ...posts[0], i: 0, sorted: true, comments: [{ type: "disagree", text: "Term fits most people, but not all. See" }, { type: "question", text: "What return are you assuming on the invest-the-rest part?" }] },
      { ...posts[1], i: 1, sorted: false, comments: [{ type: "question", text: "" }] },
    ]);
  });
});

describe("connection notes", () => {
  it("needs a name and a reason, and defaults the goal", () => {
    expect(parseEngageRequest({ mode: "connect", name: " Sarah Chen ", reason: " Her post on CPF top-ups ", goal: "nope" })).toEqual({
      ok: true,
      request: { mode: "connect", name: "Sarah Chen", about: "", reason: "Her post on CPF top-ups", goal: "know" },
    });
    expect(parseEngageRequest({ mode: "connect", name: "Sarah", reason: "  " })).toMatchObject({ ok: false });
    expect(parseEngageRequest({ mode: "connect", name: "", reason: "x" })).toMatchObject({ ok: false });
  });

  it("keeps the recruit script identical to the recruit kit's and uses it only to recruit", () => {
    expect(SEND_TEN).toBe(SEND_TEN_SCRIPT);
    const r = { name: "Sarah", about: "Teacher", reason: "Her post on leaving teaching", goal: "recruit" as const };
    expect(buildConnectPrompt(r).user).toContain(SEND_TEN);
    expect(buildConnectPrompt({ ...r, goal: "client" }).user).not.toContain(SEND_TEN);
    expect(buildConnectPrompt(r).user).toContain("To: Sarah, Teacher");
    expect(buildConnectPrompt(r).system).toContain(`under ${NOTE_MAX - 20} characters`);
    expect(buildConnectPrompt(r).system).toMatch(/never a conversation, client or event you made up/);
  });

  it("tells every draft that nothing exists beyond what was given: no workshop, no other interest of theirs", () => {
    // live check 2026-10-09: first said "After a recent workshop I led", follow4 "I also noticed your interest in"
    const { system } = buildConnectPrompt({ name: "Rachel", about: "HR manager", reason: "posted about burnout", goal: "client" });
    expect(system).toMatch(/All four drafts: you know only their name, the line about them and the reason given\. Nothing else exists/);
    expect(system).toContain("'I also noticed'");
    expect(system).toContain("[your example]");
  });

  it("reads four clean drafts, and none without a note and a first message", () => {
    const d = readConnect(JSON.stringify({ note: "Saw your post \u2014 loved it. https://x.co", first: "Hi Sarah, thanks for connecting.", follow4: "One more thing.", follow10: "I'll leave it here." }));
    expect(d).toEqual({ note: "Saw your post, loved it.", first: "Hi Sarah, thanks for connecting.", follow4: "One more thing.", follow10: "I'll leave it here." });
    expect(readConnect(JSON.stringify({ note: "Hi", follow4: "x" }))).toBeNull();
    expect(readConnect("nope")).toBeNull();
  });
});
