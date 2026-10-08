import { describe, expect, it } from "vitest";
import { REPLY_ANSWERS } from "../../../src/data/recruitKit";
import {
  CLIENT_MIN,
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
