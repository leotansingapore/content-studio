import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftEntry } from "@/lib/draftHistory";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));

const { getDraftById, upsertDraft, threadOf } = await import("@/lib/draftHistory");
const { isNumbered, keepWorking, loadWorking, numbered, readsAsThread, renumber, saveThread, splitThread, startThreadWrite, threadProblem, threadWriting, unnumbered } = await import("./threadSplit");

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const UID = "13b28b1d-2ecb-40be-b3a9-aefc90366f9b";
const entry = (extra: Partial<DraftEntry> = {}): DraftEntry => ({
  id: "d1",
  createdAt: "2026-10-21T00:00:00.000Z",
  hook: "Most people pay for their hospital stay twice.",
  draft: "Body",
  pillar: "",
  pillarDetail: "",
  audience: "",
  format: "text-post",
  platform: "linkedin",
  ctaType: "",
  ...extra,
});

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: new MemStorage() };
  vi.stubGlobal("sessionStorage", new MemStorage());
  callFn.mockReset();
});

// A 250-word LinkedIn post the way Write hands it over: hook, short paragraphs, hashtags, sign-off, disclosure.
const sentence = (n: number) => `Point ${n} is that the co-pay on a private ward bill can run to S$3,000 a year, which most people only learn at discharge.`;
const POST = [
  "Most people pay for their hospital stay twice.",
  [1, 2, 3].map(sentence).join(" "),
  "#hospital #insurance",
  [4, 5, 6].map(sentence).join(" "),
  [7, 8].map(sentence).join(" "),
  `${[9, 10].map(sentence).join(" ")} DM me PLAN and I'll send the checklist. #cpf #sg`,
  "Leo Tan, financial adviser",
  "Written with AI assistance. Paid partnership.",
].join("\n\n");

describe("Split it myself", () => {
  it("puts the hook alone first, and the hashtags, sign-off and disclosure on the last post", () => {
    const posts = splitThread(POST, "threads", ["Leo Tan, financial adviser"]);
    expect(posts[0]).toBe("Most people pay for their hospital stay twice.");
    const last = posts[posts.length - 1];
    expect(last.endsWith("Leo Tan, financial adviser\n\nWritten with AI assistance. Paid partnership.\n\n#cpf #sg #hospital #insurance")).toBe(true);
    for (const p of posts.slice(0, -1)) {
      expect(p).not.toMatch(/#|Written with AI|Leo Tan/);
    }
  });

  it("splits a 250-word post into Threads-sized posts with no sentence cut in half, every word kept", () => {
    expect(POST.split(/\s+/).length).toBeGreaterThanOrEqual(250);
    const posts = splitThread(POST, "threads", ["Leo Tan, financial adviser"]);
    expect(posts.length).toBeGreaterThan(2);
    for (const p of posts) expect(p.length).toBeLessThanOrEqual(495);
    for (let n = 1; n <= 10; n++) expect(posts.filter((p) => p.includes(sentence(n)))).toHaveLength(1);
    const words = (t: string) => t.split(/\s+/).filter(Boolean).sort();
    expect(words(posts.join(" "))).toEqual(words(POST));
  });

  it("uses X's room, and breaks a sentence longer than a post at a word without dropping any of it", () => {
    const long = `${Array(6).fill("most people never check what their plan pays for a private ward").join(" and ")}.`;
    const posts = splitThread(`Hook first.\n\n${long}`, "x");
    expect(posts[0]).toBe("Hook first.");
    for (const p of posts) expect(p.length).toBeLessThanOrEqual(275);
    expect(posts.slice(1).join(" ")).toBe(long);
  });

  it("takes the hashtags off the end of the last line too, and keeps a hook too long to stand alone", () => {
    expect(splitThread("Short hook.\n\nBody line one. #cpf #money", "threads")).toEqual(["Short hook.", "Body line one.\n\n#cpf #money"]);
    const hook = `${"word ".repeat(120).trim()}.`;
    const posts = splitThread(`${hook}\n\nNext.`, "threads");
    expect(posts.join(" ").split(/\s+/)).toEqual(`${hook} Next.`.split(/\s+/));
  });
});

describe("the thread's checks", () => {
  it("names the first post over its limit the way the captions panel does", () => {
    expect(threadProblem(["ok", "x".repeat(512)], "threads")).toBe("Post 2 is over Threads's 500 character limit by 12. Trim before posting.");
    expect(threadProblem(["ok", "x".repeat(290)], "x")).toBe("Post 2 is over X's 280 character limit by 10. Trim before posting.");
    expect(threadProblem(["ok", " "], "threads")).toBe("Fill in every post, or take the empty one out.");
    expect(threadProblem(["only one"], "threads")).toBe("A thread needs 2 posts or more.");
    expect(threadProblem(Array(11).fill("post"), "threads")).toBe("A thread takes up to 10 posts. Join or cut some first.");
    expect(threadProblem(["one", "two"], "threads")).toBeNull();
  });

  it("numbers posts, takes the numbers off, and numbers them again after a move", () => {
    const n = numbered(["a", "b", "c"]);
    expect(n).toEqual(["1/3 a", "2/3 b", "3/3 c"]);
    expect(isNumbered(n)).toBe(true);
    expect(isNumbered(["a", "b"])).toBe(false);
    expect(unnumbered(n)).toEqual(["a", "b", "c"]);
    expect(renumber([n[1], n[0], n[2]], true)).toEqual(["1/3 b", "2/3 a", "3/3 c"]);
    expect(renumber(["2/3 b", "x"], false)).toEqual(["2/3 b", "x"]);
  });
});

describe("kept with the draft", () => {
  it("saves a thread that fits on its draft, and keeps the rest only in this tab", () => {
    upsertDraft(UID, entry());
    expect(saveThread(UID, "d1", { network: "x", posts: [" One. ", "Two."] })).toBe(true);
    expect(threadOf(getDraftById(UID, "d1")!)).toEqual({ network: "x", posts: ["One.", "Two."] });
    expect(saveThread(UID, "d1", { network: "threads", posts: ["One.", "x".repeat(501)] })).toBe(false);
    expect(saveThread(UID, "d1", { network: "threads", posts: ["One.", ""] })).toBe(false);
    expect(saveThread(UID, "gone", { network: "threads", posts: ["One.", "Two."] })).toBe(false);
    expect(threadOf(getDraftById(UID, "d1")!)?.posts).toEqual(["One.", "Two."]);
    keepWorking("d1", { network: "threads", posts: ["One.", "x".repeat(501)] });
    expect(loadWorking("d1")?.posts[1]).toHaveLength(501);
    expect(loadWorking("other")).toBeNull();
  });

  it("saves the AI's thread on the draft even with the panel closed, and runs one write at a time", async () => {
    upsertDraft(UID, entry());
    let answer: (v: unknown) => void = () => {};
    callFn.mockImplementation(() => new Promise((done) => (answer = done)));
    const run = startThreadWrite(UID, "d1", "The post.", "threads");
    expect(startThreadWrite(UID, "d1", "The post.", "threads")).toBe(run);
    expect(threadWriting("d1")).toBe(run);
    expect(callFn).toHaveBeenCalledTimes(1);
    expect(callFn.mock.calls[0].slice(0, 2)).toEqual(["video-assist", { mode: "thread", post: "The post.", network: "threads" }]);
    answer({ posts: ["One.", "Two.", "Three."] });
    await expect(run).resolves.toEqual(["One.", "Two.", "Three."]);
    expect(threadOf(getDraftById(UID, "d1")!)).toEqual({ network: "threads", posts: ["One.", "Two.", "Three."] });
    expect(threadWriting("d1")).toBeNull();
  });

  it("a failed write saves nothing and can be tried again", async () => {
    upsertDraft(UID, entry());
    callFn.mockRejectedValueOnce(new Error("Couldn't write the thread right now. Try again in a minute."));
    await expect(startThreadWrite(UID, "d1", "The post.", "x")).rejects.toThrow("Couldn't write the thread");
    expect(threadOf(getDraftById(UID, "d1")!)).toBeNull();
    expect(threadWriting("d1")).toBeNull();
  });
});

describe("Reads well as a thread", () => {
  it("shows at Jev's 0.6, says nothing on no answer or an error, and asks once per draft", async () => {
    callFn.mockResolvedValueOnce({ yes: 0.6 });
    await expect(readsAsThread("a", "post")).resolves.toBe(true);
    await expect(readsAsThread("a", "post")).resolves.toBe(true);
    expect(callFn).toHaveBeenCalledTimes(1);
    expect(callFn.mock.calls[0]).toEqual(["writing-judge", { mode: "thread", post: "post" }]);
    callFn.mockResolvedValueOnce({ yes: 0.59 });
    await expect(readsAsThread("b", "post")).resolves.toBe(false);
    callFn.mockResolvedValueOnce({ yes: null });
    await expect(readsAsThread("c", "post")).resolves.toBeNull();
    callFn.mockRejectedValueOnce(new Error("403"));
    await expect(readsAsThread("d", "post")).resolves.toBeNull();
  });
});
