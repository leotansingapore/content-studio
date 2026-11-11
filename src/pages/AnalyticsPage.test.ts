// /analytics is live for everyone: its first frame must draw exactly as it did before phase 7a's Leo-only parts
// (grade chips, Winner found, What wins, How the score did), pinned on today's code (35537cb1). Never update the
// pinned file with vitest -u.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const as = vi.hoisted(() => ({ user: null as null | undefined | { id: string; email: string } }));
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

const { default: AnalyticsPage, WeekPosts } = await import("./AnalyticsPage");
const html = (path = "/analytics") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(AnalyticsPage)));

afterEach(() => {
  as.user = null;
});

describe("/analytics for everyone else", () => {
  it("draws today's first frame", async () => {
    await expect(html()).toMatchFileSnapshot("./__pins__/analytics-page-everyone.html");
  });
  it("draws today's first frame while the sign-in is still being read", async () => {
    as.user = undefined;
    await expect(html()).toMatchFileSnapshot("./__pins__/analytics-page-everyone.html");
  });
  it("draws today's first frame on Leo's links", async () => {
    for (const path of ["/analytics?grade=d-1#winners", "/analytics?link=p-1#real-numbers", "/analytics?wins=hook#what-wins", "/analytics#score-check"])
      await expect(html(path)).toMatchFileSnapshot("./__pins__/analytics-page-everyone.html");
  });
});

describe("/analytics for a new sign-in", () => {
  it("shows one handle box, with the other two folded and still on the page", () => {
    const out = html();
    expect(out.match(/<details class="group">/g)?.length).toBeGreaterThanOrEqual(1);
    expect(out).toContain("Add LinkedIn or Facebook by hand");
    expect(out.indexOf("Your accounts")).toBeGreaterThan(out.indexOf("<details"));
    expect(out).not.toMatch(/<details[^>]* open/);
  });
  it("has no card titled like the heading above it", async () => {
    const { default: AccountAudit } = await import("@/components/AccountAudit");
    const out = renderToStaticMarkup(createElement(AccountAudit, { accounts: {}, profession: "", onSaveAccount: () => undefined }));
    expect(out).toContain("Your account audit");
    expect(out).not.toContain("Audit your account");
    expect(out).toContain("Audit my Instagram");
  });
});

describe("/analytics once a handle is typed", () => {
  const FILLED = /<(a|button)[^>]*class="[^"]*\bbg-primary text-primary-foreground[^"]*"[^>]*>(.*?)<\/\1>/g;
  const filled = (out: string) => [...out.matchAll(FILLED)].map((m) => m[2].replace(/<[^>]+>/g, "").trim());
  it("while the first audit reads, the one filled button is the next step: write a post", async () => {
    const { AuditReading } = await import("@/components/AccountAudit");
    const out = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AuditReading, { platform: "instagram", stalled: false })));
    expect(out).toContain("The first audit takes about a minute.");
    expect(filled(out)).toEqual(["Write a post while it reads"]);
    expect(out).toContain('href="/studio#topic"');
  });
  it("adding a second account is a quiet button, so it never competes", async () => {
    const { default: AccountAudit } = await import("@/components/AccountAudit");
    const accounts = { instagram: { handle: "@adatan.sg", connectedAt: "2026-11-11T00:00:00Z" } } as never;
    const out = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AccountAudit, { accounts, profession: "", onSaveAccount: () => undefined })));
    expect(out).toContain("Add your TikTok too");
    expect(out).toContain("Audit my TikTok");
    expect(filled(out)).toEqual([]);
    // the first account's button stays the filled one
    const first = renderToStaticMarkup(createElement(AccountAudit, { accounts: {}, profession: "", onSaveAccount: () => undefined }));
    expect(filled(first)).toEqual(["Audit my Instagram"]);
  });
});

describe("This week's Best and Weakest rows", () => {
  const posts = [
    { id: "d1", hook: "CPF at 55", platform: "linkedin", impressions: 400, engagements: 30 },
    { id: "d2", hook: "", platform: "tiktok", impressions: 0, engagements: 3 },
  ];
  type Grade = (id: string, title: string) => { chip: ReturnType<typeof createElement>; panel: ReturnType<typeof createElement> | null } | null;
  const draw = (grade?: Grade) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(WeekPosts, { title: "Best", posts, grade })));
  // today's rows, captured before the grade chips (52f0d9e4)
  const TODAY = "<div class=\"min-w-0 space-y-1.5\"><p class=\"text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground\">Best</p><a class=\"flex min-h-11 flex-col justify-center rounded-lg border border-border/60 px-3 py-1.5 transition-colors hover:border-primary/40\" href=\"/generate?draft=d1\"><span class=\"truncate text-sm font-medium text-foreground\">CPF at 55</span><span class=\"text-[11px] text-muted-foreground\">LinkedIn \u00b7 400 impressions \u00b7 30 engagements</span></a><a class=\"flex min-h-11 flex-col justify-center rounded-lg border border-border/60 px-3 py-1.5 transition-colors hover:border-primary/40\" href=\"/generate?draft=d2\"><span class=\"truncate text-sm font-medium text-foreground\">Untitled</span><span class=\"text-[11px] text-muted-foreground\">TikTok \u00b7 3 engagements</span></a></div>";

  it("draw today's rows for everyone else", () => {
    expect(draw()).toBe(TODAY);
  });
  it("carry Leo's grade chip beside the row's link, never inside it, and its panel under that row only", () => {
    const html = draw((id, title) => ({ chip: createElement("button", null, `chip ${id} ${title}`), panel: id === "d1" ? createElement("section", null, "panel d1") : null }));
    expect(html).toContain('href="/generate?draft=d1"');
    expect(html).toMatch(/<\/a><div[^>]*><button>chip d1 CPF at 55<\/button><\/div><\/div><section>panel d1<\/section>/);
    expect(html).toMatch(/<button>chip d2 Untitled<\/button><\/div><\/div><\/div>$/);
    expect(html.match(/<a [^>]*>(?:(?!<\/a>).)*<button/g)).toBeNull();
  });
});
