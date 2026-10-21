import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } } }));

import { supabase } from "@/lib/supabase";
import { getDraftById, upsertDraft, type DraftEntry } from "./draftHistory";
import { prompterLines, scriptSentences, scrollSeconds, titlesRun, writeTitles } from "./prompter";

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

const script = [
  "**HOOK (first 3 seconds):** Your CPF is not a savings account.",
  "[Point at camera]",
  "**BODY:**",
  "It pays you a rate. Most people never check it.",
  "**CTA:** Comment CPF and I'll send the steps.",
].join("\n");
const draft = `${script}\n\n---\n\n**CAPTION:**\nCPF, plainly. #cpf`;
const beat = (say: string) => ({ say, onScreen: "", visual: "To camera", seconds: 3 });

describe("prompterLines", () => {
  it("reads HOOK, BODY and CTA without their labels, directions or the caption", () => {
    expect(prompterLines({ draft })).toEqual([
      "Your CPF is not a savings account.",
      "It pays you a rate. Most people never check it.",
      "Comment CPF and I'll send the steps.",
    ]);
  });

  it("reads the storyboard's say lines when the storyboard was made from this script", () => {
    const storyboard = { beats: [beat("Your CPF is not savings."), beat(" "), beat("Check your rate.")], script, madeAt: "" };
    expect(prompterLines({ draft, storyboard })).toEqual(["Your CPF is not savings.", "Check your rate."]);
  });

  it("falls back to the script when the script changed since the storyboard", () => {
    const storyboard = { beats: [beat("Old line.")], script: "An older script.", madeAt: "" };
    expect(prompterLines({ draft, storyboard })[0]).toBe("Your CPF is not a savings account.");
  });

  it("reads a draft with no caption heading as all script", () => {
    expect(prompterLines({ draft: "HOOK: One.\nCTA: Two." })).toEqual(["One.", "Two."]);
  });
});

describe("scrollSeconds", () => {
  it("scrolls at 2.0, 2.6 and 3.2 words a second", () => {
    expect(scrollSeconds(26, "slow")).toBe(13);
    expect(scrollSeconds(26, "normal")).toBe(10);
    expect(scrollSeconds(32, "fast")).toBe(10);
    expect(scrollSeconds(0, "normal")).toBe(0);
  });
});

describe("scriptSentences", () => {
  it("times each spoken sentence at 2.5 words a second, back to back", () => {
    const { sentences, duration } = scriptSentences(script);
    expect(sentences.map((x) => x.text)).toEqual([
      "Your CPF is not a savings account.",
      "It pays you a rate.",
      "Most people never check it.",
      "Comment CPF and I'll send the steps.",
    ]);
    expect(sentences[0]).toEqual({ s: 0, e: 2.8, text: "Your CPF is not a savings account." });
    expect(sentences[1].s).toBe(2.8);
    expect(duration).toBe(sentences[3].e);
    expect(duration).toBeGreaterThanOrEqual(3);
  });

  it("counts a very short script as 3 seconds, the publish floor", () => {
    expect(scriptSentences("Hi there.")).toEqual({ sentences: [{ s: 0, e: 0.8, text: "Hi there." }], duration: 3 });
  });
});

describe("writeTitles", () => {
  const entry: DraftEntry = {
    id: "d1", createdAt: "2026-10-21T00:00:00.000Z", hook: "Your CPF", draft, pillar: "topic", pillarDetail: "CPF",
    audience: "general", format: "short-video", platform: "instagram", ctaType: "comment-keyword",
  };
  beforeEach(() => vi.stubGlobal("window", { localStorage: memoryStorage() }));
  afterEach(() => {
    vi.unstubAllGlobals();
    invoke.mockReset();
  });

  it("sends the script as timed sentences, saves three titles and the cover on the draft, one run at a time", async () => {
    upsertDraft("u1", entry);
    let finish!: (v: unknown) => void;
    invoke.mockReturnValue(new Promise((r) => (finish = r)));
    const run = writeTitles("u1", "d1", script);
    expect(writeTitles("u1", "d1", "other")).toBe(run);
    expect(titlesRun("d1")).toBe(run);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe("video-assist");
    expect(invoke.mock.calls[0][1].body).toEqual({ mode: "publish", ...scriptSentences(script) });
    finish({ data: { titles: ["One", "Two", "Three"], cover: "Check your CPF", at: 4.2 }, error: null });
    expect(await run).toEqual({ titles: ["One", "Two", "Three"], cover: "Check your CPF" });
    expect(getDraftById("u1", "d1")).toMatchObject({ titles: ["One", "Two", "Three"], cover: "Check your CPF" });
    expect(titlesRun("d1")).toBeNull();
    // Write saving the draft again keeps them
    upsertDraft("u1", { ...entry, draft: "Edited" });
    expect(getDraftById("u1", "d1")?.titles).toEqual(["One", "Two", "Three"]);
  });

  it("shows the plain failure line and saves nothing on a refusal or an empty reply", async () => {
    upsertDraft("u1", entry);
    invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: "Couldn't write titles right now. Try again in a minute." }), { status: 502 }) } });
    await expect(writeTitles("u1", "d1", script)).rejects.toThrow("Couldn't write titles right now. Try again in a minute.");
    invoke.mockResolvedValue({ data: { titles: [], cover: "" }, error: null });
    await expect(writeTitles("u1", "d1", script)).rejects.toThrow("Couldn't write titles right now. Try again in a minute.");
    expect(getDraftById("u1", "d1")?.titles).toBeUndefined();
  });
});
