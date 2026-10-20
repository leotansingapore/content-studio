import { afterEach, describe, expect, it, vi } from "vitest";

// a brand's links in the database, and every delete call made on them
const db = vi.hoisted(() => ({ links: [] as { id: string; profile_id: string }[], deleted: [] as string[], failOn: "" }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://hub.supabase.co",
  supabase: {
    from: () => ({
      select: () => ({
        eq: async (col: "profile_id", v: string) => ({ data: db.links.filter((l) => l[col] === v).map(({ id }) => ({ id })), error: null }),
      }),
    }),
    rpc: async (_name: string, a: { p_id: string }) => {
      if (a.p_id === db.failOn) return { data: null, error: { message: "Failed to fetch" } };
      db.deleted.push(a.p_id);
      return { data: true, error: null };
    },
  },
}));

import {
  countsByLink,
  dailyClicks,
  deleteBrandLinks,
  fetchPublicReport,
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

describe("removing a brand", () => {
  afterEach(() => {
    db.links = [];
    db.deleted = [];
    db.failOn = "";
  });

  it("deletes only that brand's tracked links, each one through the delete call", async () => {
    db.links = [{ id: "a", profile_id: "brand-2" }, { id: "b", profile_id: "me" }, { id: "c", profile_id: "brand-2" }];
    await deleteBrandLinks("brand-2");
    expect(db.deleted).toEqual(["a", "c"]);
  });

  it("stops with a reason when a delete does not go through, so the brand is kept to try again", async () => {
    db.links = [{ id: "a", profile_id: "brand-2" }, { id: "c", profile_id: "brand-2" }];
    db.failOn = "a";
    await expect(deleteBrandLinks("brand-2")).rejects.toThrow("Couldn't reach the server. Check your connection and try again.");
    expect(db.deleted).toEqual([]);
  });
});

describe("the public report page", () => {
  afterEach(() => vi.unstubAllGlobals());
  const SLUG = "abcdefghij2345678xyz";

  it("shows the report, says gone for a bad or switched-off address, and try again only when the server is down", async () => {
    const report = { campaign: "CNY 2027", clicks: 9, people: 4, days: [], links: [] };
    const fetch = vi.fn(async (url: string) =>
      url.endsWith(`/report/${SLUG}`) ? new Response(JSON.stringify(report)) : url.includes("/report/zzzzzzzzzzzzzzzzzzzz") ? new Response("", { status: 503 }) : new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchPublicReport(SLUG.toUpperCase())).toEqual({ ok: true, data: report });
    expect(await fetchPublicReport("abcdefghij2345678xy0")).toEqual({ ok: false, gone: true });
    expect(await fetchPublicReport("zzzzzzzzzzzzzzzzzzzz")).toEqual({ ok: false, gone: false });
    // a pasted address cut short is gone without asking the server
    fetch.mockClear();
    expect(await fetchPublicReport("abcdef")).toEqual({ ok: false, gone: true });
    expect(fetch).not.toHaveBeenCalled();
    vi.stubGlobal("fetch", async () => Promise.reject(new TypeError("Failed to fetch")));
    expect(await fetchPublicReport(SLUG)).toEqual({ ok: false, gone: false });
  });
});
