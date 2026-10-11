import { describe, expect, it } from "vitest";
import {
  countsByLink,
  dailyClicks,
  isTrackedUrl,
  linkInputProblem,
  reportLostBy,
  reportUrl,
  trackedUrl,
  type Campaign,
  type DayRow,
  type TrackedLink,
} from "./trackedLinks";

const ok = { slug: "", label: "Free review", url: "yoursite.sg/review", campaign: "" };
const EMPTY_FORM = { slug: "", label: "", url: "", campaign: "" };
const link = (id: string, campaign_id: string | null): TrackedLink => ({ id, campaign_id, slug: id, label: id, url: "https://a.sg", created_at: "" });

describe("addresses", () => {
  it("builds the /t/ and report addresses on the app's host", () => {
    expect(trackedUrl("https://consultant-content-studio.vercel.app/", "ada-guide")).toBe("https://consultant-content-studio.vercel.app/t/ada-guide");
    expect(reportUrl("https://x.app", "abcdefghij2345678xyz")).toBe("https://x.app/t/report/abcdefghij2345678xyz");
  });
  it("knows our own tracked addresses, as cs_save_tracked_link does", () => {
    expect(isTrackedUrl("https://consultant-content-studio.vercel.app/t/ada")).toBe(true);
    expect(isTrackedUrl("HTTPS://Consultant-Content-Studio.Vercel.App.:443/t/x?r=1")).toBe(true);
    expect(isTrackedUrl("consultant-content-studio.vercel.app/t/ada")).toBe(true);
    expect(isTrackedUrl("https://hgdbflprrficdoyxmdxe.supabase.co/functions/v1/tracked-link/ada")).toBe(true);
    expect(isTrackedUrl("https://consultant-content-studio.vercel.app/l/ada-tan")).toBe(false);
    expect(isTrackedUrl("https://consultant-content-studio.vercel.app/tutorial")).toBe(false);
  });
});

describe("linkInputProblem", () => {
  it("passes a label and a bare web address, with or without a chosen slug", () => {
    expect(linkInputProblem(ok)).toBeNull();
    expect(linkInputProblem({ ...ok, slug: "ada-review", campaign: "CNY 2027" })).toBeNull();
  });
  it("names the first problem", () => {
    expect(linkInputProblem({ ...ok, slug: "ab" })).toMatch(/3 to 40/);
    expect(linkInputProblem({ ...ok, slug: "report" })).toMatch(/reserved/);
    expect(linkInputProblem({ ...ok, slug: "bio" })).toMatch(/reserved/);
    expect(linkInputProblem({ ...ok, label: " " })).toMatch(/label/);
    expect(linkInputProblem({ ...ok, label: "x".repeat(61) })).toMatch(/60 characters/);
    expect(linkInputProblem({ ...ok, url: "javascript:alert(1)" })).toMatch(/web address/);
    expect(linkInputProblem({ ...ok, url: "https://consultant-content-studio.vercel.app/t/ada" })).toMatch(/already a tracked link/);
    expect(linkInputProblem({ ...ok, campaign: "c".repeat(61) })).toMatch(/campaign/);
    expect(linkInputProblem({ ...EMPTY_FORM })).toMatch(/web address/);
  });
});

describe("counts", () => {
  const rows: DayRow[] = [
    { link_id: "a", day: "2026-10-11", clicks: 5, people: 3 },
    { link_id: "a", day: "2026-10-05", clicks: 2, people: 1 },
    { link_id: "a", day: "2026-09-20", clicks: 9, people: 9 },
    { link_id: "b", day: "2026-10-10", clicks: 1, people: 1 },
  ];
  it("adds clicks and people per link from a day on", () => {
    const week = countsByLink(rows, "2026-10-05");
    expect(week.get("a")).toEqual({ clicks: 7, people: 4 });
    expect(week.get("b")).toEqual({ clicks: 1, people: 1 });
    expect(countsByLink(rows, "2026-09-12").get("a")).toEqual({ clicks: 16, people: 13 });
  });
  it("gives one zero-filled point per Singapore day, oldest first, for some links or all", () => {
    const now = new Date("2026-10-11T03:00:00Z"); // 11:00 in Singapore
    const all = dailyClicks(rows, 7, now);
    expect(all.map((d) => d.day)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(all.map((d) => d.clicks)).toEqual([2, 0, 0, 0, 0, 1, 5]);
    expect(dailyClicks(rows, 7, now, new Set(["b"])).map((d) => d.clicks)).toEqual([0, 0, 0, 0, 0, 1, 0]);
    expect(dailyClicks(rows, 30, now)).toHaveLength(30);
  });
});

describe("reportLostBy", () => {
  const campaigns: Campaign[] = [
    { id: "c1", name: "CNY 2027", report_slug: "abcdefghij2345678xyz" },
    { id: "c2", name: "Quiet", report_slug: null },
  ];
  it("warns when the last link of a campaign with its report on is deleted or moved out", () => {
    const links = [link("a", "c1"), link("b", "c2"), link("c", null)];
    expect(reportLostBy(links, campaigns, "a")?.name).toBe("CNY 2027");
    expect(reportLostBy(links, campaigns, "a", "")?.name).toBe("CNY 2027");
    expect(reportLostBy(links, campaigns, "a", "Other")?.name).toBe("CNY 2027");
  });
  it("stays quiet when the link stays, others remain, or the report is off", () => {
    expect(reportLostBy([link("a", "c1")], campaigns, "a", "cny 2027")).toBeNull();
    expect(reportLostBy([link("a", "c1"), link("d", "c1")], campaigns, "a")).toBeNull();
    expect(reportLostBy([link("b", "c2")], campaigns, "b")).toBeNull();
    expect(reportLostBy([link("c", null)], campaigns, "c")).toBeNull();
    expect(reportLostBy([], campaigns, "x")).toBeNull();
  });
});
