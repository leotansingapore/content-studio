import { describe, expect, it, vi } from "vitest";
import {
  FIT_POOL,
  FIT_QUESTIONS,
  MAX_CANDIDATES,
  MIN_TOPICS,
  TOPICS,
  fitState,
  handleFit,
  keptTopics,
  parseFitRequest,
  topicAsk,
  type Candidate,
  type FitDeps,
} from "./logic";

const request = (extra: Record<string, unknown> = {}) => ({
  serves: "Sales-oriented self-employed professionals",
  sells: "ActivityTracker, a sales activity app",
  topics: ["Prospecting", "Habits"],
  ...extra,
});
const candidate = (i: number): Candidate => ({
  id: `c${i}`,
  title: `Carousel ${i}`,
  topic: "Business",
  format: "List",
  caption: "Save this for your next week",
  slide_text: ["5 habits", "1. Plan calls", "2. Log every one", "4. never shown"],
});
const noulFor = (pick: (topic: string) => number) =>
  Object.fromEntries(TOPICS.map((t, i) => [`t${i}`, { type: "noul" as const, noul: pick(t) }]));

describe("the carousel-fit request", () => {
  it("needs who the brand serves and clips the rest", () => {
    expect(parseFitRequest(request({ serves: "  " }))).toBeNull();
    expect(parseFitRequest(null)).toBeNull();
    const r = parseFitRequest(request({ topics: Array(20).fill("cpf") }))!;
    expect(r.topics).toHaveLength(12);
    expect(r.sells).toBe("ActivityTracker, a sales activity app");
  });

  it("asks one noul per topic about the brand's own audience and offer, never a profession", () => {
    const ask = topicAsk(parseFitRequest(request())!);
    expect(Object.keys(ask.questions)).toHaveLength(TOPICS.length);
    expect(ask.state).toEqual({ serves: "Sales-oriented self-employed professionals", sells: "ActivityTracker, a sales activity app", topics: ["Prospecting", "Habits"] });
    for (const q of [...Object.values(ask.questions), FIT_QUESTIONS.fit]) {
      expect(String(q.instructions)).toContain("`serves`");
      expect(String(q.instructions)).not.toMatch(/advis/i);
    }
  });

  it("shows Jev the carousel's first three slides and caption beside the brand", () => {
    const s = fitState(parseFitRequest(request())!, candidate(1));
    expect(s.carousel).toEqual({ title: "Carousel 1", topic: "Business", format: "List", words: "5 habits / 1. Plan calls / 2. Log every one | Save this for your next week" });
    expect(s.serves).toBe("Sales-oriented self-employed professionals");
  });
});

describe("the topics Jev keeps", () => {
  it("keeps every topic from 0.5 up, likeliest first", () => {
    const kept = keptTopics(noulFor((t) => ({ Business: 0.9, Productivity: 0.8, Psychology: 0.6, Design: 0.55 })[t] ?? 0.1));
    expect(kept).toEqual(["Business", "Productivity", "Psychology", "Design"]);
  });

  it("fills up to three with the likeliest when fewer clear the bar", () => {
    expect(keptTopics(noulFor((t) => (t === "Business" ? 0.9 : t === "Education" ? 0.4 : t === "Productivity" ? 0.3 : 0.1)))).toEqual(["Business", "Education", "Productivity"]);
    expect(MIN_TOPICS).toBe(3);
  });

  it("is null when Jev answered none", () => {
    expect(keptTopics(null)).toBeNull();
    expect(keptTopics({})).toBeNull();
  });
});

describe("a carousel-fit run", () => {
  const deps = (over: Partial<FitDeps> = {}) => ({
    hasJev: true,
    consume: vi.fn(async () => ({ allowed: true as const, used: 1, limit: 6 })),
    refund: vi.fn(async () => null),
    ask: vi.fn(async (state: unknown, q: Record<string, unknown>) => {
      if ("t0" in q) return noulFor((t) => (t === "Business" ? 0.9 : 0.2));
      const id = (state as { carousel: { title: string } }).carousel.title;
      return { fit: { type: "score" as const, score: id === "Carousel 1" ? 3 : 1.5 } };
    }),
    candidates: vi.fn(async (_topics: string[], limit: number) => Array.from({ length: Math.min(limit, 3) }, (_, i) => candidate(i))),
    ...over,
  });

  it("ranks the kept topics' carousels from 0 to 1 and keeps the use", async () => {
    const d = deps();
    const r = await handleFit(request(), d);
    expect(r).toEqual({ status: 200, body: { fit: { c0: 0.5, c1: 1, c2: 0.5 }, topics: ["Business", "AI & technology", "Art & photography"] } });
    expect(d.candidates).toHaveBeenCalledWith(["Business", "AI & technology", "Art & photography"], MAX_CANDIDATES);
    expect(d.consume).toHaveBeenCalledTimes(1);
    expect(d.refund).not.toHaveBeenCalled();
  });

  it("keeps at most 16 Jev calls in flight", async () => {
    let live = 0;
    let most = 0;
    const d = deps({
      candidates: vi.fn(async () => Array.from({ length: 40 }, (_, i) => candidate(i))),
      ask: vi.fn(async (_s: unknown, q: Record<string, unknown>) => {
        if ("t0" in q) return noulFor(() => 0.9);
        most = Math.max(most, ++live);
        await new Promise((res) => setTimeout(res, 1));
        live--;
        return { fit: { type: "score" as const, score: 2 } };
      }),
    });
    const r = await handleFit(request(), d);
    expect(Object.keys((r.body as { fit: Record<string, number> }).fit)).toHaveLength(40);
    expect(most).toBe(FIT_POOL);
  });

  it("leaves out a carousel Jev did not answer for", async () => {
    const d = deps({
      ask: vi.fn(async (state: unknown, q: Record<string, unknown>) =>
        "t0" in q ? noulFor(() => 0.9) : (state as { carousel: { title: string } }).carousel.title === "Carousel 0" ? null : { fit: { type: "score" as const, score: 0 } }),
    });
    expect((await handleFit(request(), d)).body).toMatchObject({ fit: { c1: 0, c2: 0 } });
  });

  it("gives the use back and answers null when Jev answers no topic or no carousel", async () => {
    for (const ask of [vi.fn(async () => null), vi.fn(async (_s: unknown, q: Record<string, unknown>) => ("t0" in q ? noulFor(() => 0.9) : null))]) {
      const d = deps({ ask });
      expect(await handleFit(request(), d)).toEqual({ status: 200, body: { fit: null } });
      expect(d.refund).toHaveBeenCalledWith(new Date().toISOString().slice(0, 10));
    }
  });

  it("spends nothing without a Jev key or with a bad request, and passes a refusal on", async () => {
    const off = deps({ hasJev: false });
    expect(await handleFit(request(), off)).toEqual({ status: 200, body: { fit: null } });
    const bad = deps();
    expect((await handleFit(request({ serves: "" }), bad)).status).toBe(400);
    for (const d of [off, bad]) expect(d.consume).not.toHaveBeenCalled();
    const capped = deps({ consume: vi.fn(async () => ({ allowed: false as const, limit: 6, reason: "limit" as const })) });
    expect((await handleFit(request(), capped)).status).toBe(429);
    expect(capped.ask).not.toHaveBeenCalled();
  });
});
