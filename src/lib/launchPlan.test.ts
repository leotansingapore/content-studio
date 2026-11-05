import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, briefFor, cleanLink, daysBetween, groupOf, loadLaunch, makerLabel, makerUrl, saveLaunch, stepDate, stepStates, STEPS, type LaunchPlan } from "./launchPlan";

const plan: LaunchPlan = { thing: "Tidy", date: "2026-12-04", link: "https://apps.apple.com/us/app/tidy/id1234567", done: [] };
const step = (id: string) => STEPS.find((s) => s.id === id)!;
const params = (url: string) => Object.fromEntries(new URLSearchParams(url.split("?")[1]));

describe("the month", () => {
  it("counts back from the launch date: every pre-launch post falls before it, launch day on it", () => {
    const pre = STEPS.filter((s) => s.offset < 0);
    expect(pre.length).toBeGreaterThan(6);
    for (const s of pre) expect(stepDate(plan, s) < plan.date).toBe(true);
    expect(stepDate(plan, step("live"))).toBe("2026-12-04");
    expect(stepDate(plan, step("why"))).toBe("2026-11-07");
    // in order, oldest first, about a month before and a week after
    const dates = STEPS.map((s) => stepDate(plan, s));
    expect([...dates].sort()).toEqual(dates);
    expect(daysBetween(dates[0], plan.date)).toBeGreaterThanOrEqual(25);
  });

  it("crosses a month and a year end on whole days", () => {
    expect(addDays("2026-12-30", 5)).toBe("2027-01-04");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
  });

  it("groups the posts by how far out they are", () => {
    expect(STEPS.map(groupOf)).toEqual(["4 weeks out", "4 weeks out", "3 weeks out", "3 weeks out", "2 weeks out", "2 weeks out", "Launch week", "Launch week", "Launch week", "Launch day", "After launch", "After launch"]);
  });
});

describe("each post opens its maker", () => {
  it("Write gets the brief, the format and the funnel stage, and the link only where the post sends people", () => {
    const list = params(makerUrl(plan, step("list")));
    expect(makerUrl(plan, step("list")).startsWith("/generate?")).toBe(true);
    expect(list).toEqual({ ctx: `The people on the early list hear first when Tidy opens. End by sending people to ${plan.link}`, format: "short-video", funnel: "conversion" });
    expect(params(makerUrl(plan, step("why"))).ctx).toBe("Why I'm making Tidy, and the moment that started it");
    expect(briefFor({ ...plan, link: "" }, step("list"))).toBe("The people on the early list hear first when Tidy opens");
  });
  it("Hooks, Slideshow and hook plus demo get the topic", () => {
    expect(makerUrl(plan, step("problem"))).toBe(`/hooks?topic=${encodeURIComponent("The problem Tidy fixes, in the words people use for it").replace(/%20/g, "+")}`);
    expect(params(makerUrl(plan, step("day")))).toEqual({ from: "topic", topic: "A day with the problem Tidy fixes" });
    expect(params(makerUrl(plan, step("first-look")))).toEqual({ topic: "A first look at Tidy: one screen or one result" });
    expect(makerUrl(plan, step("first-look")).startsWith("/make/hook-demo?")).toBe(true);
    expect(makerLabel(step("first-look"))).toBe("Hook plus demo");
    expect(makerLabel(step("today"))).toBe("Write a carousel");
    expect(makerLabel(step("day"))).toBe("Slideshow");
  });
});

describe("where each post stands", () => {
  it("marks made, missed, today and the next one, once", () => {
    const s = stepStates({ ...plan, done: ["why"] }, "2026-11-13");
    expect([s.why, s.problem, s.today, s.day, s["first-look"]]).toEqual(["done", "past", "next", "later", "later"]);
    const onDay = stepStates(plan, "2026-11-14");
    expect(onDay.today).toBe("today");
    expect(Object.values(onDay).filter((x) => x === "next" || x === "today")).toHaveLength(1);
  });
});

describe("the link", () => {
  it("keeps http(s) addresses and gives a bare domain https", () => {
    expect(cleanLink("tidy.app/join")).toBe("https://tidy.app/join");
    expect(cleanLink(" https://apps.apple.com/us/app/x/id1 ")).toBe("https://apps.apple.com/us/app/x/id1");
    expect(cleanLink("javascript:alert(1)")).toBe("");
    expect(cleanLink("not a link")).toBe("");
  });
});

describe("kept per brand", () => {
  const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
  beforeEach(() => {
    const m = new Map<string, string>();
    const s = { get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() };
    vi.stubGlobal("window", { localStorage: s, location: { pathname: "/launch", search: "", hash: "" }, history: { state: null, replaceState: () => undefined } });
    vi.stubGlobal("localStorage", s);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads back what was saved, dropping unknown steps and a bad link", () => {
    saveLaunch(UID, { ...plan, done: ["why", "why", "nope"] });
    expect(loadLaunch(UID)).toEqual({ ...plan, done: ["why"] });
    localStorage.setItem(`content-studio-launchplan-${UID}`, JSON.stringify({ thing: "x", date: "2026-02-30x", link: "", done: [] }));
    expect(loadLaunch(UID)).toBeNull();
    saveLaunch(UID, null);
    expect(loadLaunch(UID)).toBeNull();
  });
});
