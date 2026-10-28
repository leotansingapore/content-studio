import { describe, expect, it } from "vitest";
import { adviserWordsIn, PROFESSIONS } from "../_shared/adviserWords";
import {
  buildCommentsPrompt,
  buildConnectPrompt,
  buildDmsPrompt,
  buildRepliesPrompt,
  buildThreadPrompt,
  commentQuestions,
  dmQuestions,
  escalateQuestions,
  readEscalations,
  typeQuestions,
  type CommentKind,
  type DmSort,
} from "./logic";

const COMMENTS = [{ name: "Ann", text: "How do I start?" }, { name: "Bo", text: "Great post" }, { name: "Cy", text: "I disagree, it took me a year." }];
const KINDS: CommentKind[] = ["client", "support", "substantive"];
const MESSAGES = [{ name: "Dee", text: "Saw your post, can we talk about my situation?" }, { name: "Eve", text: "We have a role for you." }];
const SORTED: DmSort[] = [{ kind: "lead", automated: false }, { kind: "recruiter", automated: false }];
const LINES = [{ name: "Fay", text: "Hi, is this for people like me?", me: false }, { name: "", text: "It can be. What do you do?", me: true }, { name: "Fay", text: "I run a small studio.", me: false }];
const POSTS = [{ name: "Gus", text: "Most people quit in the first month." }];
const CONNECT = { name: "Hal", about: "runs a studio", reason: "He posted about his first hire", goal: "client" as const };

/** Every prompt and Jev question the function builds, in every mode, with `extra` after the fixed arguments. */
const all = (...extra: string[]) => ({
  escalate: escalateQuestions(COMMENTS, ["divorce"], "a comment under their own post", ...extra),
  comments: commentQuestions(COMMENTS, ...extra),
  dms: dmQuestions(MESSAGES, ...extra),
  types: typeQuestions(POSTS, ...extra),
  replies: buildRepliesPrompt("My post about starting.", COMMENTS, KINDS, [], ...extra),
  dmDrafts: (["call", "guide", "rapport"] as const).map((g) => buildDmsPrompt(MESSAGES, SORTED, g, ...extra)),
  thread: (["call", "guide", "rapport"] as const).map((g) => buildThreadPrompt(LINES, g, ...extra)),
  commentDrafts: buildCommentsPrompt(POSTS, [{ types: ["number", "question", "disagree", "result"] }], ...extra),
  connect: (["know", "recruit", "client", "referral"] as const).map((goal) => buildConnectPrompt({ ...CONNECT, goal }, ...extra)),
});

describe("Reply drafts for the brand's profession", () => {
  it("a caller that sends no profession, or an adviser's, gets today's prompts and Jev questions byte for byte", async () => {
    await expect(JSON.stringify(all(), null, 2)).toMatchFileSnapshot("./__pins__/adviser-prompts.json");
    expect(all("")).toEqual(all());
  });

  it.each(PROFESSIONS)("$raw gets every draft and question written for them, with none of the adviser words", ({ said }) => {
    const out = all(said);
    expect(out.replies.system).toContain(`You draft replies a ${said} will paste`);
    expect(JSON.stringify(out.dms)).toContain(`A ${said} received`);
    expect(out.replies.system).not.toContain("Is this sales?");
    expect(adviserWordsIn(JSON.stringify(out))).toEqual([]);
  });

  it("names an escalated claim as a dispute for any other work", () => {
    const answers = { e0: { noul: 0.95 }, t0: { choice: "claim", probabilities: { claim: 0.9 } } } as never;
    expect(readEscalations(answers, 1, [])).toEqual(["A claim or policy dispute"]);
    expect(readEscalations(answers, 1, [], "coach")).toEqual(["A dispute"]);
  });
});
