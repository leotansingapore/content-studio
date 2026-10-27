import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeError } from "@/lib/edgeFn";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

class MemStorage {
  s = new Map<string, string>();
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}
let local: MemStorage;
let session: MemStorage;
let path = "/audiences";
let s: typeof import("./audienceSuggest");
let a: typeof import("./audiences");
// the first import transforms over 200 modules, past the 10 s hook timeout on a loaded machine: done here, at collection,
// which has no timeout, so each test's fresh import only runs them again
await import("./audienceSuggest");
await import("./audiences");
beforeEach(async () => {
  local = new MemStorage();
  session = new MemStorage();
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
  vi.stubGlobal("window", { localStorage: local, dispatchEvent: () => true });
  vi.stubGlobal("location", { get pathname() { return path; } });
  path = "/audiences";
  callFn.mockReset();
  toast.mockReset();
  // a fresh module each test: its memory copy and runs are a page load's
  vi.resetModules();
  s = await import("./audienceSuggest");
  a = await import("./audiences");
});
afterEach(() => vi.unstubAllGlobals());

const UID = "u1";
const NOW = new Date("2026-10-22T08:00:00.000Z");
const row = (name: string, o: Record<string, unknown> = {}) => ({ name, who: `${name}, in Singapore.`, lifeStage: "parent", cares: ["school fees"], says: "We save first.", ...o });
const answer = (...rows: ReturnType<typeof row>[]) => ({ audiences: rows, pagesRead: ["https://acme.sg/"], scored: true });
const waitWith = (...names: string[]) =>
  session.setItem(s.suggestKey(UID), JSON.stringify({ from: "website", host: "acme.sg", audiences: names.map((n) => row(n)), scored: true }));
const saved = () => a.loadAudiences(UID);

describe("where Suggest reads", () => {
  it("takes the kit's website, then Your market's site, else the profile", () => {
    expect(s.siteFor(UID)).toBe("");
    local.setItem(`content-studio-market-${UID}`, JSON.stringify({ site: "market.sg" }));
    expect(s.siteFor(UID)).toBe("market.sg");
    local.setItem(`content-studio-carousel-brand-${UID}`, JSON.stringify({ name: "Acme", color: "#123456", handle: "", website: "https://www.acme.sg" }));
    expect(s.siteFor(UID)).toBe("acme.sg");
  });

  it("sends positioning, Coach's Who you're for and the kit's role as the profile", () => {
    expect(s.hasProfile(UID)).toBe(false);
    local.setItem(`content-studio-positioning-${UID}`, JSON.stringify({ oneLiner: "I help parents.", audience: "parent", audienceDetail: "Young parents", topics: ["CPF", "Hospital"], edge: "Ex-nurse" }));
    local.setItem(`content-studio-coachprofile-${UID}`, JSON.stringify({ audience: "Dads in their 30s" }));
    expect(s.profileAsk(UID)).toMatchObject({ oneLiner: "I help parents.", audienceDetail: "Young parents", topics: "CPF, Hospital", edge: "Ex-nurse", role: "", coachAudience: "Dads in their 30s" });
    expect(s.hasProfile(UID)).toBe(true);
  });
});

describe("a run", () => {
  it("sends the typed site with the saved audiences, and its rows wait unsaved", async () => {
    a.saveAudience(UID, { name: "Pre-retirees", who: "In their 50s", lifeStage: "pre-retiree" }, NOW);
    callFn.mockResolvedValue(answer(row("Young parents"), row("Fresh grads", { lifeStage: "young-adult", says: "" })));
    const run = s.startSuggest(UID, " acme.sg ");
    expect(s.suggestingNow(UID)).toMatchObject({ from: "website", host: "acme.sg" });
    await run;
    expect(callFn).toHaveBeenCalledWith("brand-dna", { mode: "audiences", url: "acme.sg", saved: [{ name: "Pre-retirees", who: "In their 50s" }] }, expect.any(String));
    expect(s.suggestingNow(UID)).toBeUndefined();
    expect(s.loadWaiting(UID)?.audiences.map((x) => [x.name, x.lifeStage, x.says])).toEqual([["Young parents", "parent", "We save first."], ["Fresh grads", "young-adult", undefined]]);
    expect(saved().map((x) => x.name)).toEqual(["Pre-retirees"]);
    expect(toast).not.toHaveBeenCalled();
  });

  it("sends the profile when no site is typed", async () => {
    callFn.mockResolvedValue(answer(row("Young parents")));
    await s.startSuggest(UID, "");
    expect(callFn.mock.calls[0][1]).toMatchObject({ mode: "audiences", profile: { oneLiner: "", coachAudience: "" }, saved: [] });
    expect(callFn.mock.calls[0][1]).not.toHaveProperty("url");
    expect(s.loadWaiting(UID)?.from).toBe("profile");
  });

  it("keeps the server's line and code when it refuses, and saves nothing", async () => {
    for (const [status, code, line] of [
      [429, "daily_limit", "You've used all 5 for today. It resets at 8am Singapore time."],
      [403, "not_enabled", "This isn't switched on for your account yet."],
      [422, "none_new", "Nothing new on acme.sg about who you serve. Add one yourself."],
      [502, "failed", "We couldn't read acme.sg. Check the address, or suggest from your profile."],
    ] as const) {
      callFn.mockRejectedValueOnce(new EdgeError(line, status, code));
      await s.startSuggest(UID, "acme.sg");
      expect(s.suggestFailed(UID)).toEqual({ line, code });
      expect(s.loadWaiting(UID)).toBeNull();
    }
    expect(saved()).toEqual([]);
  });

  it("reads an empty or unreadable answer as failed, and the next run clears the line", async () => {
    callFn.mockResolvedValueOnce({ audiences: [] });
    await s.startSuggest(UID, "acme.sg");
    expect(s.suggestFailed(UID)?.line).toBe(s.failedLine("acme.sg"));
    callFn.mockResolvedValueOnce(answer(row("Young parents")));
    await s.startSuggest(UID, "acme.sg");
    expect(s.suggestFailed(UID)).toBeUndefined();
  });

  it("runs once at a time, and says so where you are when you left the page", async () => {
    let answerNow: (v: unknown) => void = () => undefined;
    callFn.mockReturnValue(new Promise((r) => (answerNow = r)));
    const run = s.startSuggest(UID, "acme.sg");
    void s.startSuggest(UID, "acme.sg");
    path = "/generate";
    answerNow(answer(row("Young parents")));
    await run;
    expect(callFn).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Your suggested audiences are ready" }));
  });
});

describe("the waiting rows", () => {
  it("keep: saved as an audience from the website, gone from the rows, the first one main", () => {
    waitWith("Young parents", "Fresh grads");
    expect(s.keepSuggested(UID, 1, NOW)).toBeNull();
    expect(saved()).toMatchObject([{ name: "Fresh grads", lifeStage: "parent", cares: ["school fees"], says: "We save first.", source: "website", main: true }]);
    expect(s.loadWaiting(UID)?.audiences.map((x) => x.name)).toEqual(["Young parents"]);
  });

  it("keep all: in order until 6 are active, the rest wait with the limit line", () => {
    for (const n of ["A", "B", "C", "D", "E"]) a.saveAudience(UID, { name: n }, NOW);
    waitWith("Young parents", "Fresh grads");
    expect(s.keepAllSuggested(UID, NOW)).toEqual({ kept: 1, error: a.FULL_LINE });
    expect(saved()).toHaveLength(6);
    expect(s.loadWaiting(UID)?.audiences.map((x) => x.name)).toEqual(["Fresh grads"]);
  });

  it("keep all empties the rows and the tab's copy", () => {
    waitWith("Young parents", "Fresh grads");
    expect(s.keepAllSuggested(UID, NOW)).toEqual({ kept: 2, error: null });
    expect(saved().map((x) => x.name)).toEqual(["Young parents", "Fresh grads"]);
    expect(s.loadWaiting(UID)).toBeNull();
    expect(session.getItem(s.suggestKey(UID))).toBeNull();
  });

  it("remove: the row goes and nothing is saved; the last one clears the tab's copy", () => {
    waitWith("Young parents", "Fresh grads");
    s.removeSuggested(UID, 0);
    expect(s.loadWaiting(UID)?.audiences.map((x) => x.name)).toEqual(["Fresh grads"]);
    s.removeSuggested(UID, 0);
    expect(s.loadWaiting(UID)).toBeNull();
    expect(session.getItem(s.suggestKey(UID))).toBeNull();
    expect(saved()).toEqual([]);
  });

  it("survive a reload of the page", async () => {
    callFn.mockResolvedValue(answer(row("Young parents"), row("Fresh grads")));
    await s.startSuggest(UID, "acme.sg");
    s.removeSuggested(UID, 0);
    vi.resetModules();
    const again = await import("./audienceSuggest");
    expect(again.loadWaiting(UID)).toMatchObject({ from: "website", host: "acme.sg", scored: true, audiences: [{ name: "Fresh grads" }] });
  });
});
