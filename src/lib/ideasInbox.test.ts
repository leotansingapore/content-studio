import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeError } from "@/lib/edgeFn";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));
const setIdeaStatus = vi.fn(async () => undefined);
vi.mock("@/lib/accountAudit", async (orig) => ({ ...(await orig<typeof import("@/lib/accountAudit")>()), setIdeaStatus: (...a: unknown[]) => setIdeaStatus(...(a as [])) }));

vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoOnly: () => true }));

class MemStorage {
  s = new Map<string, string>();
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}
let local: MemStorage;
let m: typeof import("./ideasInbox");
beforeEach(async () => {
  local = new MemStorage();
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", new MemStorage());
  vi.stubGlobal("window", { localStorage: local, dispatchEvent: () => true, addEventListener: () => undefined, removeEventListener: () => undefined });
  callFn.mockReset();
  setIdeaStatus.mockClear();
  // a fresh module each test: its job and undo step are a page load's
  vi.resetModules();
  m = await import("./ideasInbox");
});
afterEach(() => vi.unstubAllGlobals());

const UID = "u1";
// 22 Oct 2026, 16:00 in Singapore; never the real clock
const NOW = new Date("2026-10-22T08:00:00.000Z");
const DAY = "2026-10-22";
const POSITIONING = { oneLiner: "I help young parents plan.", audience: "parent", audienceDetail: "Young parents in Singapore", topics: ["CPF", "Hospital bills"], edge: "Ex-nurse" };

// ---- fixtures, one or more per source ----
const brief = (id: string, o: Record<string, unknown> = {}) => ({
  id, createdAt: `2026-10-${String(10 + Number(id.replace(/\D/g, "") || 0)).padStart(2, "0")}T01:00:00.000Z`, source: "note", chosenHook: 0, note: 1,
  idea: `Idea ${id}`, angle: `Angle ${id}`, hooks: [`Hook ${id}`], talkingPoints: ["one"], cta: "DM me", ctaType: "dm-me", format: "carousel",
  platform: "instagram", funnelStage: "trust", stageReason: `Why ${id}`, ...o,
});
const auditIdea = (id: string, status: "new" | "used" | "dismissed" = "new") => ({
  id, audit_id: "a1", batch: 1, position: 0, hook: `Audit hook ${id}`, idea: `Audit idea ${id}`, format: "video", based_on_post_id: null, why: `Audit why ${id}`, formula: null, status,
  created_at: "2026-10-20T00:00:00.000Z",
});
const news = (url: string, o: Record<string, unknown> = {}) => ({ keyword: "CPF", title: `Story ${url}`, url, source: "CNA", date: "2026-10-21", snippet: `Snippet ${url}`, relevant: true, tag: "act", ...o });
const market = (items: ReturnType<typeof news>[], written: string[] = []) => ({
  name: "", site: "", audience: "", topics: [], questions: [], dismissed: [], written,
  checks: [{ checkedAt: "2026-10-21T00:00:00.000Z", news: items, geo: [], posts: [] }],
});
const feedItem = (id: string) => ({
  id, from: "fo", kind: "organic", account: "@someone", who: "Someone", text: `Caption ${id}\nmore`, meta: "Reel, 20 Oct, Instagram", numbers: "1K views, 10 likes",
  outlier: null, at: Date.parse("2026-10-20T00:00:00Z"), active: false, days: null, source: {}, remixUrl: `/remix?k=${id}`, url: `https://instagram.com/p/${id}`,
});
const trend = (id: string, found: string) => ({
  id, platform: "tiktok", format: "short-video", pillar: "topic", title: `Trend ${id}`, why_it_works: `Works ${id}`, how_to_film: "film", source_label: "TikTok",
  source_url: "https://tiktok.com/x", date_found: found, trend_source: `Riding ${id}`, hooks: [`Trend hook ${id}`], talking_points: ["point"],
});
const story = (id: string, at: string) => ({ id, title: `News ${id}`, gist: `Gist ${id}`, talkingPoint: `Point ${id}`, clientMessage: null, source: "ST", url: `https://st.sg/${id}`, publishedAt: at, topic: "CPF" });
const boardItem = (key: string, opening: string) => ({
  key, kind: "link", url: `https://instagram.com/reel/${key}`, platform: "instagram", title: `Saved ${key}`, caption: "caption", author: "@creator", cover: "", numbers: {},
  postedAt: "", savedAt: "2026-10-19T00:00:00.000Z", boards: [], note: "", read: "done", ...(opening ? { tags: { opening } } : {}),
});

function stores(o: Record<string, unknown> = {}) {
  return {
    briefs: [], drafts: [], audience: null, audits: [], market: market([]), feed: [], niche: { picks: { day: "", ids: [] }, hidden: [] },
    trends: [], news: [], boards: [], savedTop: [], ...o,
  } as unknown as Parameters<typeof m.poolIdeas>[0];
}
const bySource = <T extends { source: string }>(list: T[], s: string) => list.filter((i) => i.source === s);

describe("poolIdeas", () => {
  it("maps Idea Dump briefs, leaves out the ones on the board and keeps the 10 newest", () => {
    const briefs: Record<string, unknown>[] = Array.from({ length: 12 }, (_, i) => brief(`b${i + 1}`));
    briefs[11] = { ...briefs[11], boardDraftId: "d1" };
    const out = m.poolIdeas(stores({ briefs, drafts: [{ id: "d1", hook: "" }] }), NOW);
    const dump = bySource(out, "dump");
    expect(dump).toHaveLength(10);
    expect(dump.some((i) => i.key === "dump:b12")).toBe(false);
    expect(dump[0]).toMatchObject({ key: "dump:b11", title: "Idea b11", angle: "Angle b11", why: "Why b11", format: "carousel", stage: "trust", hooks: ["Hook b11"] });
    expect(dump[0].writeUrl).toMatch(/^\/generate\?pillar=topic&detail=Idea\+b11/);
  });

  it("maps new audit ideas only, with the audit's own Write link", () => {
    const audits = [{ platform: "instagram", handle: "leo", posts: [], ideas: [auditIdea("i1"), auditIdea("i2", "used"), auditIdea("i3", "dismissed")] }];
    const out = bySource(m.poolIdeas(stores({ audits }), NOW), "posts");
    expect(out.map((i) => i.key)).toEqual(["audit:i1"]);
    expect(out[0]).toMatchObject({ title: "Audit hook i1", angle: "Audit idea i1", why: "Audit why i1", format: "short-video", auditIdea: "i1" });
    expect(out[0].writeUrl).toContain("platform=instagram");
    expect(out[0].from).toBe("Your @leo audit, Tue 20 Oct");
  });

  it("maps the newest market check's Act stories, minus written ones and Watch", () => {
    const items = [news("https://a.sg/1"), news("https://a.sg/2"), news("https://a.sg/3", { tag: "watch" })];
    const out = bySource(m.poolIdeas(stores({ market: market(items, ["n:https://a.sg/2"]) }), NOW), "market");
    expect(out.map((i) => i.key)).toEqual(["market:n:https://a.sg/1"]);
    expect(out[0]).toMatchObject({ title: "Story https://a.sg/1", angle: "Snippet https://a.sg/1", why: "Your market check marked this Act (CPF).", marketKey: "n:https://a.sg/1" });
    expect(out[0].writeUrl).toMatch(/^\/generate\?/);
  });

  it("maps For you's Today's 5 for today only, skipping hidden ones, to their remix links", () => {
    const feed = [feedItem("fo:1"), feedItem("fo:2"), feedItem("fo:3")];
    const today = m.poolIdeas(stores({ feed, niche: { picks: { day: DAY, ids: ["fo:1", "fo:2", "gone"] }, hidden: ["fo:2"] } }), NOW);
    const out = bySource(today, "foryou");
    expect(out.map((i) => i.key)).toEqual(["foryou:fo:1"]);
    expect(out[0]).toMatchObject({ title: "Caption fo:1", angle: "Someone, Reel, 20 Oct, Instagram, 1K views, 10 likes", writeUrl: "/remix?k=fo:1", fromUrl: "https://instagram.com/p/fo:1" });
    expect(out[0].why).toBe("One of today's 5 picks for your brand, from Following.");
    const yesterday = m.poolIdeas(stores({ feed, niche: { picks: { day: "2026-10-21", ids: ["fo:1"] }, hidden: [] } }), NOW);
    expect(bySource(yesterday, "foryou")).toEqual([]);
  });

  it("maps trends found in the last 7 days only", () => {
    const trends = [trend("t1", "2026-10-22"), trend("t2", "2026-10-16"), trend("t3", "2026-10-15")];
    const out = bySource(m.poolIdeas(stores({ trends }), NOW), "trends");
    expect(out.map((i) => i.key)).toEqual(["trend:t1", "trend:t2"]);
    expect(out[0]).toMatchObject({ title: "Trend t1", angle: "Riding t1", why: "Works t1", hooks: ["Trend hook t1"] });
    expect(out[0].writeUrl).toContain("source=trend");
    expect(bySource(m.poolIdeas(stores({ trends: [trend("old", "2026-10-11")] }), NOW), "trends")).toEqual([]);
  });

  it("maps the 5 newest news stories", () => {
    const list = Array.from({ length: 7 }, (_, i) => story(`s${i}`, `2026-10-1${i}T00:00:00Z`));
    const out = bySource(m.poolIdeas(stores({ news: list }), NOW), "news");
    expect(out.map((i) => i.key)).toEqual(["news:s6", "news:s5", "news:s4", "news:s3", "news:s2"]);
    expect(out[0]).toMatchObject({ title: "News s6", angle: "Point s6", why: "Gist s6", fromUrl: "https://st.sg/s6" });
    expect(out[0].writeUrl).toContain("idea=news-hook");
  });

  it("maps saved board items with a hook, and saved top posts with an idea, once each", () => {
    const boards = [boardItem("link:instagram:a", "The hook line"), boardItem("link:instagram:b", ""), boardItem("top:adv-SC1", "Board hook")];
    const savedTop = [
      { advisorId: "adv", shortCode: "SC1", advisorName: "Ann", handle: "ann", url: "https://instagram.com/p/SC1", timestamp: "2026-10-01T00:00:00Z", idea: { hook: "Top hook", format: "carousel", why: "Top why", adapt: "Top adapt" } },
      { advisorId: "adv", shortCode: "SC2", advisorName: "Ann", handle: "ann", url: "https://instagram.com/p/SC2", timestamp: "2026-10-02T00:00:00Z", idea: { hook: "Top hook 2", format: "carousel", why: "Top why 2", adapt: "Top adapt 2" } },
      { advisorId: "adv", shortCode: "SC3", advisorName: "Ann", handle: "ann", url: "https://instagram.com/p/SC3", timestamp: "2026-10-03T00:00:00Z" },
    ];
    const out = bySource(m.poolIdeas(stores({ boards, savedTop }), NOW), "saved");
    expect(out.map((i) => i.key).sort()).toEqual(["saved:link:instagram:a", "saved:top:adv-SC1", "saved:top:adv-SC2"]);
    const board = out.find((i) => i.key === "saved:link:instagram:a");
    expect(board).toMatchObject({ title: "The hook line", angle: "Saved link:instagram:a", why: "You saved this from @creator." });
    expect(board.writeUrl).toContain("source=link%3Ainstagram%3Aa");
    expect(out.find((i) => i.key === "saved:top:adv-SC2")).toMatchObject({ title: "Top hook 2", angle: "Top adapt 2", why: "Top why 2" });
  });

  it("gives every idea a stable key on a second read", () => {
    const s = stores({ briefs: [brief("b1")], news: [story("s1", "2026-10-20T00:00:00Z")], trends: [trend("t1", DAY)] });
    expect(m.poolIdeas(s, NOW).map((i) => i.key)).toEqual(m.poolIdeas(s, NOW).map((i) => i.key));
  });
});

describe("tabs and undo", () => {
  const all = () => [
    ...m.genIdeas(m.loadIdeas(UID)),
    ...m.poolIdeas(stores({ briefs: [brief("b1"), brief("b2"), brief("b3")] }), NOW),
  ];
  it("puts shortlisted, discarded and written ideas in their tab, and undo restores the one before", () => {
    m.setStatus(UID, ["dump:b1"], "shortlisted", NOW);
    m.setStatus(UID, ["dump:b2"], "discarded", NOW);
    m.markWritten(UID, { key: "dump:b3" }, NOW);
    const st = () => m.loadIdeas(UID).status;
    expect(m.arrange(all(), st(), { tab: "shortlist" }).map((i) => i.key)).toEqual(["dump:b1"]);
    expect(m.arrange(all(), st(), { tab: "discarded" }).map((i) => i.key)).toEqual(["dump:b2"]);
    expect(m.arrange(all(), st(), { tab: "inbox" })).toEqual([]);
    // Z after a put back gives the discard back; a Write in between never joins the undo step
    m.setStatus(UID, ["dump:b2"], null, NOW);
    m.markWritten(UID, { key: "dump:b1" }, NOW);
    expect(m.undoLast(UID)).toBe(true);
    expect(st()["dump:b2"]?.s).toBe("discarded");
    expect(st()["dump:b1"]?.s).toBe("written");
    m.setStatus(UID, ["dump:b1"], "shortlisted", NOW, false);
    expect(m.undoLast(UID)).toBe(false);
    const prev = m.setStatus(UID, ["dump:b1", "dump:b2"], "discarded", NOW);
    m.restoreStatus(UID, prev);
    expect(st()["dump:b1"]?.s).toBe("shortlisted");
    expect(st()["dump:b2"]?.s).toBe("discarded");
    expect(st()["dump:b3"]?.s).toBe("written");
  });

  it("orders written ideas by fit, each More like this right under its idea, then pooled newest first", () => {
    local.setItem(`content-studio-ideas-${UID}`, JSON.stringify({
      days: [{ day: DAY, ideas: [
        { key: `gen:${DAY}:1`, title: "Low", angle: "", why: "", format: "carousel", stage: "trust", fit: 0.61, at: NOW.toISOString() },
        { key: `gen:${DAY}:2`, title: "High", angle: "", why: "", format: "carousel", stage: "trust", fit: 0.9, at: NOW.toISOString() },
        { key: `gen:${DAY}:3`, title: "Like low", angle: "", why: "", format: "carousel", stage: "trust", fit: 0.99, like: `gen:${DAY}:1`, at: NOW.toISOString() },
      ] }],
      status: {}, morning: false,
    }));
    expect(m.arrange(all(), {}, { tab: "inbox" }).map((i) => i.key)).toEqual([`gen:${DAY}:2`, `gen:${DAY}:1`, `gen:${DAY}:3`, "dump:b3", "dump:b2", "dump:b1"]);
    expect(m.arrange(all(), {}, { tab: "inbox", source: "dump" })).toHaveLength(3);
  });
});

describe("the daily set", () => {
  it("is needed only once per Singapore day", () => {
    const empty = m.loadIdeas(UID);
    expect(m.needsDailySet(empty, NOW)).toBe(true);
    expect(m.needsDailySet({ ...empty, days: [{ day: DAY, ideas: [] }] }, NOW)).toBe(false);
    expect(m.needsDailySet({ ...empty, asked: DAY }, NOW)).toBe(false);
    // 23:59 the same Singapore day, then 00:01 the next
    expect(m.needsDailySet({ ...empty, asked: DAY }, new Date("2026-10-22T15:59:00Z"))).toBe(false);
    expect(m.needsDailySet({ ...empty, asked: DAY }, new Date("2026-10-22T16:01:00Z"))).toBe(true);
  });

  it("trims to 14 days and 1,000 statuses, newest kept", () => {
    const days = Array.from({ length: 16 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, "0")}`, ideas: [] }));
    const status = Object.fromEntries(Array.from({ length: 1003 }, (_, i) => [`k${i}`, { s: "discarded", at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() }]));
    const t = m.trimIdeas({ days, status, morning: false } as never);
    expect(t.days.map((d) => d.day)[0]).toBe("2026-10-03");
    expect(t.days).toHaveLength(14);
    expect(Object.keys(t.status)).toHaveLength(1000);
    expect(t.status.k0).toBeUndefined();
    expect(t.status.k1002).toBeDefined();
  });
});

describe("keyAction", () => {
  const free = { inField: false, mod: false };
  it("moves within bounds", () => {
    expect(m.keyAction("j", free, 0, 3)).toEqual({ act: "move", to: 1 });
    expect(m.keyAction("ArrowDown", free, 2, 3)).toEqual({ act: "move", to: 2 });
    expect(m.keyAction("k", free, 0, 3)).toEqual({ act: "move", to: 0 });
    expect(m.keyAction("ArrowUp", free, 2, 3)).toEqual({ act: "move", to: 1 });
    expect(m.keyAction("j", free, -1, 3)).toEqual({ act: "move", to: 0 });
    expect(m.keyAction("j", free, -1, 0)).toBeNull();
  });
  it("maps S, D, W, M and Z, upper case too", () => {
    expect(m.keyAction("s", free, 1, 3)).toEqual({ act: "shortlist" });
    expect(m.keyAction("D", free, 1, 3)).toEqual({ act: "discard" });
    expect(m.keyAction("w", free, 1, 3)).toEqual({ act: "write" });
    expect(m.keyAction("m", free, 1, 3)).toEqual({ act: "more" });
    expect(m.keyAction("z", free, -1, 0)).toEqual({ act: "undo" });
    expect(m.keyAction("s", free, -1, 3)).toBeNull();
    expect(m.keyAction("x", free, 1, 3)).toBeNull();
  });
  it("does nothing from a text field or with a modifier held", () => {
    expect(m.keyAction("s", { inField: true, mod: false }, 1, 3)).toBeNull();
    expect(m.keyAction("j", { inField: false, mod: true }, 1, 3)).toBeNull();
    expect(m.keyAction("z", { inField: false, mod: true }, 1, 3)).toBeNull();
  });
});

describe("Write", () => {
  it("marks the idea written, the audit idea used and the market pick written", () => {
    m.markWritten(UID, { key: "market:n:https://a.sg/1", marketKey: "n:https://a.sg/1" }, NOW);
    m.markWritten(UID, { key: "audit:i1", auditIdea: "i1" }, NOW);
    expect(m.loadIdeas(UID).status["market:n:https://a.sg/1"]?.s).toBe("written");
    expect(JSON.parse(local.getItem(`content-studio-market-${UID}`)).written).toEqual(["n:https://a.sg/1"]);
    expect(setIdeaStatus).toHaveBeenCalledWith("i1", "used");
  });

  it("opens Write with the title, format, stage, angle and why, and the label's id", () => {
    const url = m.genWriteUrl({ key: "gen:x:1", title: "CPF at 55", angle: "What changes", why: "They ask", format: "carousel", stage: "trust", labelId: "lb-1", fit: 0.8, at: "" });
    const p = new URLSearchParams(url.split("?")[1]);
    expect(url.startsWith("/generate?")).toBe(true);
    expect(Object.fromEntries(p)).toEqual({ pillar: "topic", detail: "CPF at 55", format: "carousel", funnel: "trust", ctx: "What changes\nWhy it fits: They ask", label: "lb-1" });
  });
});

describe("getIdeas", () => {
  const seedBrand = () => {
    local.setItem(`content-studio-positioning-${UID}`, JSON.stringify(POSITIONING));
    local.setItem(`content-studio-labels-${UID}`, JSON.stringify([{ id: "lb-1", name: "CPF", color: "primary" }, { id: "lb-2", name: "Hospital", color: "brand" }]));
  };
  const written = (title: string, o: Record<string, unknown> = {}) => ({ title, angle: `${title} angle`, why: `${title} why`, format: "carousel", stage: "trust", fit: 0.8, ...o });

  it("sends labels as names, and keeps the answer as today's ideas with their label ids", async () => {
    seedBrand();
    callFn.mockResolvedValueOnce({ ideas: [written("One", { label: "CPF", fit: 0.9 }), written("Two", { label: "Gone" })], scored: true });
    await m.getIdeas(UID, {}, NOW);
    const [name, body] = callFn.mock.calls[0];
    expect(name).toBe("idea-dump");
    expect(body).toMatchObject({ mode: "ideas", count: 6, context: { labels: ["CPF", "Hospital"], positioning: { audienceDetail: "Young parents in Singapore" } } });
    expect(body.like).toBeUndefined();
    const s = m.loadIdeas(UID);
    expect(s.asked).toBe(DAY);
    expect(s.days[0].ideas.map((g) => [g.key, g.labelId ?? null, g.fit])).toEqual([[`gen:${DAY}:1`, "lb-1", 0.9], [`gen:${DAY}:2`, null, 0.8]]);
    expect(m.needsDailySet(s, NOW)).toBe(false);
    expect(m.newIdeasCount(UID, DAY)).toBe(2);
  });

  it("asks for 3 close to the open idea with the steer, numbering on from today's", async () => {
    seedBrand();
    callFn.mockResolvedValueOnce({ ideas: [written("One")], scored: false });
    await m.getIdeas(UID, {}, NOW);
    callFn.mockResolvedValueOnce({ ideas: [written("Close", { fit: null })], scored: false });
    await m.getIdeas(UID, { like: { key: `gen:${DAY}:1`, title: "One", angle: "One angle" }, steer: "  for nurses  " }, NOW);
    const body = callFn.mock.calls[1][1];
    expect(body).toMatchObject({ count: 3, like: { title: "One", angle: "One angle" }, steer: "for nurses" });
    expect(body.posted).toContain("One");
    const ideas = m.loadIdeas(UID).days[0].ideas;
    expect(ideas[1]).toMatchObject({ key: `gen:${DAY}:2`, like: `gen:${DAY}:1`, fit: null });
  });

  it("says why when it fails: the cap, nothing safe, an unusable reply (try again) and no positioning (no call)", async () => {
    await m.getIdeas(UID, {}, NOW);
    expect(callFn).not.toHaveBeenCalled();
    expect(m.ideasFail(UID)).toMatchObject({ line: m.NO_POSITIONING_LINE, retry: false });
    seedBrand();
    callFn.mockRejectedValueOnce(new EdgeError("Today's limit", 429, "daily_limit"));
    await m.getIdeas(UID, {}, NOW);
    expect(m.ideasFail(UID)).toMatchObject({ line: m.CAPPED_LINE, retry: false });
    callFn.mockRejectedValueOnce(new EdgeError("None safe", 422, "none_safe"));
    await m.getIdeas(UID, {}, NOW);
    expect(m.ideasFail(UID)).toMatchObject({ line: m.NONE_SAFE_LINE, retry: false });
    callFn.mockRejectedValueOnce(new EdgeError("Unusable", 422, "unusable"));
    await m.getIdeas(UID, {}, NOW);
    expect(m.ideasFail(UID)).toMatchObject({ line: "Couldn't write today's ideas.", retry: true });
    expect(m.ideasRun(UID)).toBeNull();
    expect(m.loadIdeas(UID).days).toEqual([]);
  });

  it("writes on the visit only with the morning switch on, once a day", async () => {
    seedBrand();
    m.startMorning(UID, NOW);
    expect(callFn).not.toHaveBeenCalled();
    m.setMorning(UID, true);
    callFn.mockRejectedValueOnce(new EdgeError("x", 502, "failed"));
    m.startMorning(UID, NOW);
    expect(m.ideasRun(UID)).toMatchObject({ auto: true });
    await vi.waitFor(() => expect(m.ideasRun(UID)).toBeNull());
    // a failed morning run does not ask again that day
    m.startMorning(UID, NOW);
    expect(callFn).toHaveBeenCalledTimes(1);
  });
});

describe("the source link", () => {
  const BAD = ["javascript:alert(1)", "JAVASCRIPT:alert(1)", " javascript:alert(1)", "//evil.example", "/\\evil.example", "/\t/evil.example", "data:text/html,<b>x</b>", "vbscript:x", ""];

  it("accepts http and https as outside links and same-app paths as app links, nothing else", () => {
    for (const u of BAD) expect(m.safeLink(u), u).toBeNull();
    expect(m.safeLink("https://st.sg/a?b=1")).toEqual({ external: true, href: "https://st.sg/a?b=1" });
    expect(m.safeLink("HTTPS://ST.SG/a")).toEqual({ external: true, href: "https://st.sg/a" });
    expect(m.safeLink("/analytics")).toEqual({ external: false, href: "/analytics" });
    expect(m.safeLink("/coach#idea-dump")).toEqual({ external: false, href: "/coach#idea-dump" });
  });

  it("drops a bad link where pooled ideas are read, keeping the idea", () => {
    const out = m.poolIdeas(stores({
      news: [story("bad", "2026-10-21T00:00:00Z"), story("good", "2026-10-20T00:00:00Z")].map((s, i) => (i ? s : { ...s, url: "JAVASCRIPT:alert(1)" })),
      trends: [{ ...trend("t1", DAY), source_url: "//evil.example" }],
      boards: [{ ...boardItem("link:instagram:a", "Hook"), url: "data:text/html,x" }],
    }), NOW);
    const by = (k: string) => out.find((i) => i.key === k);
    expect(by("news:bad")).toBeDefined();
    expect(by("news:bad").fromUrl).toBeUndefined();
    expect(by("trend:t1").fromUrl).toBeUndefined();
    expect(by("saved:link:instagram:a").fromUrl).toBeUndefined();
    expect(by("news:good").fromUrl).toBe("https://st.sg/good");
  });

  it("renders a bad link as plain text, https as an outside link and a path as an app link", async () => {
    const { default: IdeaView } = await import("@/components/ideas/IdeaView");
    const noop = () => undefined;
    const html = (fromUrl: string) =>
      renderToStaticMarkup(createElement(MemoryRouter, null, createElement(IdeaView, {
        idea: { key: "news:x", source: "news", title: "T", angle: "A", why: "W", writeUrl: "/generate", from: "The source, Tue 20 Oct", fromUrl, at: "" },
        status: null, labels: [], left: 3, busy: false, writing: null, capped: false, failed: null, refine: "",
        onRefineText: noop, onWrite: noop, onShortlist: noop, onDiscard: noop, onMore: noop, onRetry: noop, onLabel: noop, onBack: noop,
      })));
    for (const u of BAD.filter(Boolean)) {
      const out = html(u);
      expect(out, u).toContain(">The source, Tue 20 Oct</p>");
      expect(out.toLowerCase(), u).not.toMatch(/href="(javascript|data|vbscript):|href="\/\/|href="\/\\|evil\.example/);
    }
    expect(html("https://st.sg/a")).toContain('<a href="https://st.sg/a" target="_blank" rel="noreferrer"');
    expect(html("/analytics")).toContain('<a class="underline underline-offset-2" href="/analytics">The source, Tue 20 Oct</a>');
  });
});
