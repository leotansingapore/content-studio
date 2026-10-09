import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/edgeFn", () => ({ callFn: vi.fn() }));

import { callFn } from "@/lib/edgeFn";
import { factLines, ideaIsThin, pickHook, scoreProfile, textPostBetter, type ProfileScore } from "./writingJudge";

const call = vi.mocked(callFn);
afterEach(() => {
  call.mockReset();
  vi.useRealTimers();
});

describe("Jev's calls in Write fall back to no recommendation", () => {
  it("recommends a hook only when Jev names one of the hooks on screen", async () => {
    const hooks = ["a", "b", "c"];
    call.mockResolvedValueOnce({ pick: { index: 2 } });
    expect(await pickHook(hooks, "parents", "CPF", "linkedin")).toBe(2);
    expect(call).toHaveBeenCalledWith("writing-judge", { mode: "hooks", hooks, audience: "parents", topic: "CPF", platform: "linkedin" });
    for (const pick of [{ index: 3 }, { index: 1.5 }, { index: -1 }, null]) {
      call.mockResolvedValueOnce({ pick });
      expect(await pickHook(hooks, "parents", "CPF", "linkedin")).toBeNull();
    }
    call.mockRejectedValueOnce(new Error("You've used all 60 for today."));
    expect(await pickHook(hooks, "parents", "CPF", "linkedin")).toBeNull();
  });

  it("writes without the idea check when Jev takes over 4 seconds or gives no clear answer", async () => {
    vi.useFakeTimers();
    call.mockReturnValueOnce(new Promise(() => {}));
    const slow = ideaIsThin("CPF top-ups", "", "post");
    await vi.advanceTimersByTimeAsync(4000);
    expect(await slow).toBeNull();
    vi.useRealTimers();
    call.mockResolvedValueOnce({ thin: true });
    expect(await ideaIsThin("CPF top-ups", "", "post")).toBe(true);
    call.mockResolvedValueOnce({ thin: "yes" });
    expect(await ideaIsThin("CPF top-ups", "", "post")).toBeNull();
    call.mockRejectedValueOnce(new Error("down"));
    expect(await ideaIsThin("CPF top-ups", "", "post")).toBeNull();
  });

  it("suggests a text post over a carousel only on a clear answer in time", async () => {
    call.mockResolvedValueOnce({ textPostBetter: false });
    expect(await textPostBetter("one point")).toBe(false);
    call.mockResolvedValueOnce({});
    expect(await textPostBetter("one point")).toBeNull();
    vi.useFakeTimers();
    call.mockReturnValueOnce(new Promise(() => {}));
    const slow = textPostBetter("one point");
    await vi.advanceTimersByTimeAsync(4000);
    expect(await slow).toBeNull();
  });

  it("flags only the sentences that come back as text, and says when facts weren't checked", async () => {
    call.mockResolvedValueOnce({ lines: ["CPF LIFE payouts start at 65.", 3, null] });
    expect(await factLines("x")).toEqual(["CPF LIFE payouts start at 65."]);
    call.mockResolvedValueOnce({ nope: 1 });
    await expect(factLines("x")).rejects.toThrow("Facts weren't checked this time.");
  });

  it("refuses a profile score that comes back without a number and its items", async () => {
    const input = { platform: "instagram" as const, name: "Jun", bio: "", pinned: [], top: [], link: null };
    call.mockResolvedValueOnce({ score: "80", items: [] });
    await expect(scoreProfile(input)).rejects.toThrow("Couldn't score your profile right now. Try again in a minute.");
    const good = { score: 72, items: [] } as unknown as ProfileScore;
    call.mockResolvedValueOnce(good);
    expect(await scoreProfile(input)).toEqual(good);
  });
});
