import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

import { streamOnePost } from "./batchGenerate";

afterEach(() => vi.unstubAllGlobals());

describe("streamOnePost", () => {
  it("asks the shared writer for blanks instead of invented numbers and client stories", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await streamOnePost({ platform: "linkedin", format: "text-post" } as never, { onComplete: () => {}, onError: () => {} });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ mode: "post", noInvention: true });
  });
});
