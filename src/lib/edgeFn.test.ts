// callFn has 106 importers, so today's call is pinned before phase 6 gives it an AbortSignal (phase6-build-brief.md,
// contracts): every call made without one must keep handing invoke exactly { body }. The client is the app's real
// one; only FunctionsClient.prototype.invoke is replaced.
import { afterEach, describe, expect, it, vi } from "vitest";
import { FunctionsClient, FunctionsFetchError, FunctionsHttpError } from "@supabase/functions-js";
import { callFn, EdgeError } from "./edgeFn";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const answer = (r: { data?: unknown; error?: unknown }) =>
  vi.spyOn(FunctionsClient.prototype, "invoke").mockResolvedValue({ data: r.data ?? null, error: r.error ?? null, response: undefined } as never);

describe("callFn as every caller uses it today", () => {
  it("hands invoke exactly { body }, with two arguments and with three", async () => {
    const invoke = answer({ data: { ok: 1 } });
    expect(await callFn("remix", { a: 1 })).toEqual({ ok: 1 });
    expect(await callFn("remix", { a: 2 }, "Try again later.")).toEqual({ ok: 1 });
    // toStrictEqual: a `signal: undefined` key would fail here, not just a wrong value
    expect(invoke.mock.calls).toStrictEqual([
      ["remix", { body: { a: 1 } }],
      ["remix", { body: { a: 2 } }],
    ]);
  });

  it("turns a refusal into an EdgeError carrying the function's words, status and code", async () => {
    const body = JSON.stringify({ code: "daily_limit", error: "You've used all 30 for today. It resets at 8am Singapore time." });
    answer({ error: new FunctionsHttpError(new Response(body, { status: 429 })) });
    await expect(callFn("remix", {}, "Try again later.")).rejects.toMatchObject({
      name: "EdgeError",
      message: "You've used all 30 for today. It resets at 8am Singapore time.",
      status: 429,
      code: "daily_limit",
    });
  });

  it("uses the caller's fallback, else the default, when a refusal has no words", async () => {
    answer({ error: new FunctionsHttpError(new Response("<html>bad gateway</html>", { status: 502 })) });
    await expect(callFn("remix", {}, "Try again later.")).rejects.toMatchObject({ name: "EdgeError", message: "Try again later.", status: 502, code: "" });
    answer({ error: new FunctionsHttpError(new Response("{}", { status: 500 })) });
    await expect(callFn("remix", {})).rejects.toMatchObject({ message: "That didn't go through. Try again in a minute.", status: 500, code: "" });
  });

  it("says the server could not be reached when no response came back", async () => {
    answer({ error: new FunctionsFetchError(new TypeError("fetch failed")) });
    await expect(callFn("remix", {}, "Try again later.")).rejects.toMatchObject({
      name: "EdgeError",
      message: "Couldn't reach the server. Check your connection and try again.",
      status: 0,
      code: "",
    });
  });
});

// Stop in the agent (phase 6) aborts the Jev call through this signal, so @supabase/functions-js must hand it to fetch.
// fetch is stubbed; everything between callFn and fetch is the real client.
describe("callFn with a signal", () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

  it("hands invoke the signal only when one is given", async () => {
    const invoke = answer({ data: { ok: 1 } });
    const ctrl = new AbortController();
    await callFn("assistant-act", { a: 1 }, undefined, {});
    await callFn("assistant-act", { a: 2 }, undefined, { signal: undefined });
    await callFn("assistant-act", { a: 3 }, undefined, { signal: ctrl.signal });
    expect(invoke.mock.calls).toStrictEqual([
      ["assistant-act", { body: { a: 1 } }],
      ["assistant-act", { body: { a: 2 } }],
      ["assistant-act", { body: { a: 3 }, signal: ctrl.signal }],
    ]);
  });

  it("reaches fetch through the real functions client, with the body and the same signal", async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => json({ pick: null }));
    vi.stubGlobal("fetch", fetch);
    const ctrl = new AbortController();
    expect(await callFn("assistant-act", { text: "hi" }, undefined, { signal: ctrl.signal })).toEqual({ pick: null });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toMatch(/\/functions\/v1\/assistant-act$/);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ text: "hi" }));
    expect(init.signal).toBe(ctrl.signal);
    // a call without one sends none, as today
    await callFn("assistant-act", { text: "hi" });
    expect(fetch.mock.calls[1][1].signal).toBeUndefined();
  });

  it("rejects with an EdgeError when the signal aborts the call in flight", async () => {
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("This operation was aborted", "AbortError")))),
    );
    vi.stubGlobal("fetch", fetch);
    const ctrl = new AbortController();
    const call = callFn("assistant-act", { text: "hi" }, undefined, { signal: ctrl.signal });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    ctrl.abort();
    const err = await call.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EdgeError);
    // an abort reads like a dropped connection: Stop checks signal.aborted to tell the two apart
    expect(err).toMatchObject({ status: 0, code: "", message: "Couldn't reach the server. Check your connection and try again." });
    expect(ctrl.signal.aborted).toBe(true);
  });
});
