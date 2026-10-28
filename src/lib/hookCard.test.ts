import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {}, SUPABASE_ANON_KEY: "", SUPABASE_URL: "" }));
vi.mock("@/lib/edgeFn", () => ({ callFn: vi.fn() }));

import { callFn } from "@/lib/edgeFn";
import { CARD_SETS, cardFormulas, sanitizeIdeas, writeHooks } from "./hookCard";

describe("hook card formulas", () => {
  it("every set is three real, different formulas, and no formula repeats across sets", () => {
    for (let n = 0; n < CARD_SETS.length; n++) {
      const f = cardFormulas(n);
      expect(f).toHaveLength(3);
      expect(f.every((x) => x && x.template)).toBe(true);
      expect(new Set(f.map((x) => x.id)).size).toBe(3);
    }
    expect(new Set(CARD_SETS.flat()).size).toBe(CARD_SETS.length * 3);
  });
  it("goes round: the next press after the last set starts again", () => {
    expect(cardFormulas(CARD_SETS.length).map((f) => f.id)).toEqual(cardFormulas(0).map((f) => f.id));
    expect(cardFormulas(1)[0].id).toBe("myth-bust");
  });
});

describe("the reply from the server", () => {
  it("keeps 2-3 hooks and a pick that points at one", () => {
    expect(sanitizeIdeas({ hooks: [{ formula: "a", text: " One " }, { formula: "b", text: "Two" }], pick: 1 })).toEqual({ hooks: [{ formula: "a", text: "One" }, { formula: "b", text: "Two" }], pick: 1 });
    expect(sanitizeIdeas({ hooks: [{ formula: "a", text: "One" }, { formula: "b", text: "Two" }], pick: 2 })?.pick).toBeNull();
    expect(sanitizeIdeas({ hooks: [{ formula: "a", text: "One" }, { formula: "b", text: "  " }] })).toBeNull();
    expect(sanitizeIdeas(null)).toBeNull();
  });
});

describe("writing hooks for the brand's profession", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the open brand's profession, and none for an adviser's brand", async () => {
    const m = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } });
    const call = callFn as unknown as ReturnType<typeof vi.fn>;
    call.mockReset();
    call.mockResolvedValue({ hooks: [{ formula: "warning", text: "Start now" }, { formula: "list", text: "One step" }], pick: 0 });
    const sentences = [{ s: 0, e: 2, text: "Most people start too late." }];
    m.set("content-studio-carousel-brand-u1", JSON.stringify({ color: "#1E3A8A", name: "", handle: "", profession: "Coach" }));
    await writeHooks("u1", sentences, 2, 0);
    m.set("content-studio-carousel-brand-u1", JSON.stringify({ color: "#1E3A8A", name: "", handle: "", profession: "Financial adviser" }));
    await writeHooks("u1", sentences, 2, 0);
    const bodies = call.mock.calls.map((c) => JSON.parse(JSON.stringify(c[1])));
    expect(bodies[0]).toMatchObject({ mode: "hooks", sentences, duration: 2, profession: "coach" });
    expect(bodies[1]).not.toHaveProperty("profession");
    expect(bodies[1]).toMatchObject({ mode: "hooks", sentences, duration: 2 });
  });
});
