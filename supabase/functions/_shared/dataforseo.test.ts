import { afterEach, describe, expect, it, vi } from "vitest";
import { dfs, dfsAuth } from "./dataforseo";

afterEach(() => vi.unstubAllGlobals());
const withEnv = (env: Record<string, string | undefined>) => vi.stubGlobal("Deno", { env: { get: (k: string) => env[k] } });

describe("DataForSEO's sign-in", () => {
  it("stays off, so no paid search runs, while either secret is missing or empty", () => {
    for (const env of [{}, { DATAFORSEO_LOGIN: "me@example.test" }, { DATAFORSEO_PASSWORD: "pw" }, { DATAFORSEO_LOGIN: "", DATAFORSEO_PASSWORD: "pw" }, { DATAFORSEO_LOGIN: "me@example.test", DATAFORSEO_PASSWORD: "" }]) {
      withEnv(env);
      expect(dfsAuth(), JSON.stringify(env)).toBeNull();
    }
  });

  it("signs in with both secrets as one Basic header", () => {
    withEnv({ DATAFORSEO_LOGIN: "me@example.test", DATAFORSEO_PASSWORD: "pw" });
    expect(dfsAuth()).toBe(`Basic ${Buffer.from("me@example.test:pw").toString("base64")}`);
  });
});

describe("a DataForSEO call", () => {
  it("sends one task to the v3 path with the header, and says only the status when DataForSEO refuses", async () => {
    const sent: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => (sent.push({ url, init }), new Response('{"status_message":"auth failed for me@example.test"}', { status: 401 })));
    const err = await dfs("serp/google/organic/live/regular", { keyword: "cpf" }, "Basic c2VjcmV0", 1_000).catch((e: Error) => e);
    expect((err as Error).message).toBe("DataForSEO answered 401");
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://api.dataforseo.com/v3/serp/google/organic/live/regular");
    expect(sent[0].init.body).toBe('[{"keyword":"cpf"}]');
    expect(new Headers(sent[0].init.headers).get("authorization")).toBe("Basic c2VjcmV0");
  });
});
