import { afterEach, describe, expect, it, vi } from "vitest";
import { JEV_ENDPOINT, JEV_MODEL, askJev, choiceOf, noulOf, scoreOf, type JevQuestion } from "./jev";

const q: Record<string, JevQuestion> = { lead: { type: "noul", instructions: "Is this a potential client?" } };
const env = (key?: string) => ({ get: (n: string) => (n === "TYPESAFE_API_KEY" ? key : undefined) });
const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

afterEach(() => vi.restoreAllMocks());

describe("askJev", () => {
  it("posts the pinned model, the state and the questions with the key, and returns the answers", async () => {
    const f = reply(200, { answers: { lead: { type: "noul", noul: 0.82 } } });
    const answers = await askJev({ comment: "How much is a plan?" }, q, {}, { env: env("k1"), fetch: f as unknown as typeof fetch });
    expect(answers).toEqual({ lead: { type: "noul", noul: 0.82 } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(JEV_ENDPOINT);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k1");
    expect(JSON.parse(String(init.body))).toEqual({ model: JEV_MODEL, state: { comment: "How much is a plan?" }, questions: q });
    expect(JEV_MODEL).toBe("jev-1.13.0");
  });

  it("returns null, and never calls out, with no key or no questions", async () => {
    const f = reply(200, { answers: {} });
    expect(await askJev({}, q, {}, { env: env(undefined), fetch: f as unknown as typeof fetch })).toBeNull();
    expect(await askJev({}, {}, {}, { env: env("k1"), fetch: f as unknown as typeof fetch })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("returns null on an error status, a reply without answers, or a thrown fetch, and says who lost its judge", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await askJev({}, q, { who: "replyTriage" }, { env: env("k1"), fetch: reply(503, "no healthy upstream") as unknown as typeof fetch })).toBeNull();
    expect(await askJev({}, q, {}, { env: env("k1"), fetch: reply(200, { nope: 1 }) as unknown as typeof fetch })).toBeNull();
    const boom = vi.fn(async () => {
      throw Object.assign(new Error("slow"), { name: "TimeoutError" });
    });
    expect(await askJev({}, q, {}, { env: env("k1"), fetch: boom as unknown as typeof fetch })).toBeNull();
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([
      expect.stringMatching(/^jev: replyTriage: 503 no healthy upstream after \d+ms \(1 questions\)/),
      expect.stringMatching(/^jev: unnamed: a reply with no answers/),
      expect.stringMatching(/^jev: unnamed: timed out/),
    ]);
  });
});

describe("answer readers", () => {
  const answers = {
    a: { type: "noul" as const, noul: 0.4 },
    b: { type: "choice" as const, choice: "lead" },
    c: { type: "choice" as const, choice: "invented" },
    d: { type: "score" as const, score: 3.2 },
    e: { type: "noul" as const, noul: Number.NaN },
  };
  it("reads a number or an offered option, and null for anything else", () => {
    expect(noulOf(answers, "a")).toBe(0.4);
    expect(noulOf(answers, "e")).toBeNull();
    expect(noulOf(null, "a")).toBeNull();
    expect(choiceOf(answers, "b", ["lead", "peer", "noise"] as const)).toBe("lead");
    expect(choiceOf(answers, "c", ["lead", "peer"] as const)).toBeNull();
    expect(scoreOf(answers, "d")).toBe(3.2);
    expect(scoreOf(answers, "a")).toBeNull();
  });
});
