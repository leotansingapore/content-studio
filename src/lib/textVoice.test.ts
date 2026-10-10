import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } },
}));
vi.mock("@/lib/edgeFn", () => ({ callFn: vi.fn(async () => ({ audio: btoa("x".repeat(2000)), spans: [] })) }));

import { callFn } from "@/lib/edgeFn";
import { speak, speakDub } from "./textVoice";

const sent = () => JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body));

afterEach(() => vi.unstubAllGlobals());

describe("speak", () => {
  it("sends the feeling and pace with the script, and nothing extra without them", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(2000))));
    await speak("Hello there", "george", { emotion: "calm", pace: "slower" });
    expect(sent()).toEqual({ text: "Hello there", voice: "george", emotion: "calm", pace: "slower" });

    // the AI presenter and explainer call it this way, and must sound as before
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(2000))));
    await speak("Hello there", "alice");
    expect(sent()).toEqual({ text: "Hello there", voice: "alice" });
  });
});

describe("speakDub", () => {
  it("sends the feeling and pace with the lines", async () => {
    await speakDub(["你好"], "sarah", "zh", { emotion: "energetic", pace: "faster" });
    expect(callFn).toHaveBeenLastCalledWith(
      "text-voice",
      { mode: "dub", lines: ["你好"], voice: "sarah", lang: "zh", emotion: "energetic", pace: "faster" },
      expect.any(String),
    );
  });
});
