import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } } }));

import { supabase } from "@/lib/supabase";
import { getDraftById, upsertDraft, type DraftEntry } from "./draftHistory";
import { makeStoryboard, storyboardRun } from "./storyboard";

// Node builds its fetch classes the first time one is used, which takes seconds on a busy
// machine: build them while this file loads, not inside a test's 5 s.
void new Response("");

const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

const entry: DraftEntry = {
  id: "d1",
  createdAt: "2026-10-08T00:00:00.000Z",
  hook: "Your CPF isn't lazy money",
  draft: "Your CPF isn't lazy money.\nHere's why.\n\nCAPTION:\nCPF. #cpf",
  pillar: "topic",
  pillarDetail: "CPF",
  audience: "general",
  format: "short-video",
  platform: "instagram",
  ctaType: "comment-keyword",
};
const beats = [
  { say: "Your CPF isn't lazy money.", onScreen: "CPF is not lazy", visual: "To camera", seconds: 3 },
  { say: "Here's why.", onScreen: "", visual: "Screen recording", seconds: 5 },
];

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: memoryStorage() });
});
afterEach(() => {
  vi.unstubAllGlobals();
  invoke.mockReset();
});

describe("makeStoryboard", () => {
  it("sends the script, saves the shot list on the draft and runs once at a time", async () => {
    upsertDraft("u1", entry);
    let finish!: (v: unknown) => void;
    invoke.mockReturnValue(new Promise((r) => (finish = r)));
    const run = makeStoryboard("u1", "d1", "Your CPF isn't lazy money.\nHere's why.", "CPF");
    expect(makeStoryboard("u1", "d1", "other", "")).toBe(run);
    expect(storyboardRun("d1")).toBe(run);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe("storyboard");
    expect(invoke.mock.calls[0][1].body).toEqual({ script: "Your CPF isn't lazy money.\nHere's why.", topic: "CPF" });
    finish({ data: { beats, usage: { used: 1, limit: 30 } }, error: null });
    const board = await run;
    expect(board).toMatchObject({ beats, script: "Your CPF isn't lazy money.\nHere's why." });
    expect(getDraftById("u1", "d1")?.storyboard).toEqual(board);
    expect(storyboardRun("d1")).toBeNull();
  });

  it("keeps the storyboard when Write saves the draft again without it", async () => {
    upsertDraft("u1", entry);
    invoke.mockResolvedValue({ data: { beats }, error: null });
    const board = await makeStoryboard("u1", "d1", "script", "");
    upsertDraft("u1", { ...entry, draft: "Edited" });
    expect(getDraftById("u1", "d1")?.storyboard).toEqual(board);
  });

  it("refuses an incomplete answer and shows the server's refusal", async () => {
    upsertDraft("u1", entry);
    invoke.mockResolvedValue({ data: { beats: [beats[0]] }, error: null });
    await expect(makeStoryboard("u1", "d1", "s", "")).rejects.toMatchObject({ code: "server_error" });
    invoke.mockResolvedValue({
      data: null,
      error: { context: new Response(JSON.stringify({ code: "daily_limit", error: "You've used all 30 for today." }), { status: 429 }) },
    });
    await expect(makeStoryboard("u1", "d1", "s", "")).rejects.toMatchObject({ code: "daily_limit", message: "You've used all 30 for today." });
    expect(getDraftById("u1", "d1")?.storyboard).toBeUndefined();
  });
});
