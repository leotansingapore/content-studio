// The schedule steps on Leo's sign-in (publish-schedule, publish-tiktok, publish-per-network): what each step blocks on,
// which calls run before the one press that posts, what that press sends, and what the finished and failed states say.
// Node has no DOM, so the hooks are stood in for (the PostItForMe.test.ts pattern): each draw collects the effects whose
// deps changed, the test runs them, and a button is pressed by calling the onClick it has in the element tree.
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const shim = vi.hoisted(() => ({ i: 0, e: 0, slots: [] as unknown[], deps: [] as (unknown[] | undefined)[], effects: [] as (() => unknown)[] }));
const fn = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[], answers: {} as Record<string, (body: Record<string, unknown>) => unknown> }));
const url = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock("react", async (actual) => {
  const real = await actual<typeof import("react")>();
  const slot = <T,>(make: () => T): T => {
    const i = shim.i++;
    if (!(i in shim.slots)) shim.slots[i] = make();
    return shim.slots[i] as T;
  };
  const useState = (init: unknown) => {
    const i = shim.i;
    slot(() => (typeof init === "function" ? (init as () => unknown)() : init));
    return [shim.slots[i], (v: unknown) => (shim.slots[i] = typeof v === "function" ? (v as (p: unknown) => unknown)(shim.slots[i]) : v)];
  };
  const useRef = (init: unknown) => slot(() => ({ current: init }));
  const useMemo = (make: () => unknown) => slot(make);
  const useEffect = (run: () => unknown, deps?: unknown[]) => {
    const k = shim.e++;
    const prev = shim.deps[k];
    if (deps && prev && deps.length === prev.length && deps.every((d, j) => Object.is(d, prev[j]))) return;
    shim.deps[k] = deps;
    shim.effects.push(run);
  };
  const hooks = { useState, useRef, useMemo, useEffect };
  return { ...real, ...hooks, default: { ...real, ...hooks } };
});
vi.mock("react-router-dom", async (actual) => ({
  ...(await actual<typeof import("react-router-dom")>()),
  useSearchParams: () => [
    url.params,
    (next: URLSearchParams | ((p: URLSearchParams) => URLSearchParams)) => (url.params = typeof next === "function" ? next(new URLSearchParams(url.params)) : next),
  ],
}));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));
vi.mock("@/lib/useLeoOnly", () => ({ useLeoUser: () => ({ id: UID, email: "leo@example.com" }), useLeoOnly: () => true, leoUser: async () => null }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => undefined }), toast: () => undefined }));
vi.mock("@/lib/aiUsage", () => ({ useUsesLeft: () => () => 30 }));
// every function call: recorded, then answered by its action (social) or its name
vi.mock("@/lib/edgeFn", async (actual) => ({
  ...(await actual<typeof import("@/lib/edgeFn")>()),
  callFn: async (name: string, body: Record<string, unknown>) => {
    fn.calls.push({ name, ...body });
    const answer = fn.answers[String(body.action ?? name)];
    if (!answer) throw new Error(`No answer for ${String(body.action ?? name)}`);
    return answer(body);
  },
}));

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const local = new MemStorage();
vi.stubGlobal("localStorage", local);
vi.stubGlobal("window", { localStorage: local, location: new URL("http://localhost/drafts"), addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true });

const { ScheduleSteps } = await import("./ScheduleSteps");
const { NetworkCaptions } = await import("./NetworkCaptions");
const { TikTokMode } = await import("./TikTokMode");
const { TIKTOK_BUSY, whenLabel } = await import("@/lib/autoPost");
import type { DraftEntry } from "@/lib/draftHistory";

const DRAFTS = `content-studio-drafts-${UID}`;
const BASE = "3 CPF myths at 55\n\nMyth one.";
const draftOf = (o: Partial<DraftEntry> = {}): DraftEntry => ({
  id: "d1",
  createdAt: "2026-10-01T00:00:00.000Z",
  hook: "3 CPF myths at 55",
  draft: BASE,
  pillar: "topic",
  pillarDetail: "",
  audience: "general",
  format: "text-post",
  platform: "linkedin",
  ctaType: "comment-keyword",
  status: "scheduled",
  scheduledFor: "2030-01-15T09:00",
  ...o,
});
const acc = (id: string, platform: string, username = id) => ({ id, platform, username, name: username, url: null, picture: null, health: "healthy", needsReconnect: false, issues: [] });
const INFO = { privacyLevels: [{ value: "PUBLIC_TO_EVERYONE", label: "Everyone" }, { value: "SELF_ONLY", label: "Only me" }], comment: true, duet: true, stitch: true, canPostMore: true, maxVideoSeconds: 600 };
const view = (status: string, platforms: { platform: string; accountId: string; status: string; draft?: boolean; error?: string }[]) => ({ id: "zp1", status, scheduledFor: "2030-01-15T01:00:00.000Z", platforms });

type El = { type: unknown; props: Record<string, unknown> & { children?: unknown } };
const kids = (n: unknown): unknown[] => (n == null || typeof n === "boolean" ? [] : Array.isArray(n) ? n.flatMap(kids) : [n]);
const text = (n: unknown): string => (typeof n === "string" || typeof n === "number" ? String(n) : isValidElement(n) ? kids((n as El).props.children).map(text).join("") : "");
function find(tree: unknown, ok: (el: El) => boolean): El | null {
  if (!isValidElement(tree)) return null;
  const el = tree as El;
  if (ok(el)) return el;
  for (const c of kids(el.props.children)) {
    const hit = find(c, ok);
    if (hit) return hit;
  }
  return null;
}
const buttonOf = (tree: unknown, words: string | RegExp) =>
  find(tree, (e) => typeof e.props.onClick === "function" && (typeof words === "string" ? text(e).trim() === words : words.test(text(e).trim())));
const press = (tree: unknown, words: string | RegExp) => {
  const el = buttonOf(tree, words);
  if (!el) throw new Error(`No button ${String(words)}`);
  (el.props.onClick as () => void)();
};
/** The checkbox in the label that reads `words`. */
const tick = (tree: unknown, words: string, on: boolean) => {
  const label = find(tree, (e) => e.type === "label" && text(e).trim() === words);
  const box = label && find(label, (e) => e.props.type === "checkbox");
  if (!box) throw new Error(`No checkbox ${words}`);
  (box.props.onChange as (e: unknown) => void)({ target: { checked: on } });
};
const settle = async () => {
  for (let k = 0; k < 10; k++) await new Promise((r) => setTimeout(r, 0));
};

type Props = Parameters<typeof ScheduleSteps>[0];
let props: Props;
/** One draw with the stand-in hooks; the effects it set up run, then a second draw shows what they did. */
async function draw(): Promise<unknown> {
  for (let k = 0; k < 2; k++) {
    shim.i = 0;
    shim.e = 0;
    ScheduleSteps(props);
    for (const run of shim.effects.splice(0)) run();
    await settle();
  }
  shim.i = 0;
  shim.e = 0;
  return ScheduleSteps(props);
}
function mount(d: DraftEntry, search = "") {
  shim.slots = [];
  shim.deps = [];
  shim.effects = [];
  url.params = new URLSearchParams(search);
  local.setItem(DRAFTS, JSON.stringify([d]));
  props = { userId: UID, draft: d, blockReason: null, onDrafts: vi.fn(), onClose: vi.fn() };
}
const actions = () => fn.calls.map((c) => String(c.action ?? c.name));
const sendButton = (tree: unknown) => buttonOf(tree, /^(Schedule for|Post now|Send to inbox|Try again)/);
const reasonLine = (tree: unknown) => {
  const next = buttonOf(tree, /^(Next|Schedule for|Post now|Send to inbox|Try again)/);
  return { disabled: !!next?.props.disabled, text: text(tree) };
};

beforeEach(() => {
  local.clear();
  fn.calls.length = 0;
  fn.answers = {};
});

describe("step 1, Where", () => {
  it("an Instagram post with no Instagram account blocks Next with one line, and a tick changes the line on the next draw", async () => {
    fn.answers.status = () => ({ accounts: [acc("li1", "linkedin", "leotan")] });
    mount(draftOf({ platform: "instagram" }));
    let tree = await draw();
    expect(text(tree)).toContain("Step 1 of 3 | Where");
    expect(reasonLine(tree)).toMatchObject({ disabled: true });
    expect(text(tree)).toContain("Choose an account to post to Instagram.");
    expect(buttonOf(tree, "Connect Instagram")).not.toBeNull();

    tick(tree, "Instagram", false);
    tree = await draw();
    expect(text(tree)).toContain("Pick an account to post to.");
    tick(tree, "LinkedIn", true);
    tree = await draw();
    expect(text(tree)).not.toContain("Pick an account to post to.");
    expect(buttonOf(tree, "Next")!.props.disabled).toBe(false);
    expect(actions()).toEqual(["status"]);
  });

  it("Connect saves the way back to this post and step, then goes to the network's sign-in", async () => {
    const session = new MemStorage();
    vi.stubGlobal("sessionStorage", session);
    const assign = vi.fn();
    (window as unknown as { location: unknown }).location = { pathname: "/generate", search: "?draft=d1&panel=post", assign };
    fn.answers.status = () => ({ accounts: [acc("li1", "linkedin")] });
    fn.answers.connect = () => ({ authUrl: "https://zernio.example/auth" });
    mount(draftOf({ platform: "instagram" }));
    press(await draw(), "Connect Instagram");
    await settle();
    expect(fn.calls.at(-1)).toMatchObject({ action: "connect", platform: "instagram" });
    expect(JSON.parse(session.getItem("cs-connect-return")!).path).toBe("/generate?draft=d1&panel=post");
    expect(assign).toHaveBeenCalledWith("https://zernio.example/auth");
  });

  it("ticks the draft's own network, and a network whose Default account was picked on /accounts, that account first and alone", async () => {
    local.setItem(`content-studio-social-defaults-${UID}`, JSON.stringify({ instagram: "ig2" }));
    fn.answers.status = () => ({ accounts: [acc("li1", "linkedin"), acc("ig1", "instagram", "first"), acc("ig2", "instagram", "second"), acc("tt1", "tiktok")] });
    fn.answers["tiktok-creator-info"] = () => ({ info: INFO });
    mount(draftOf());
    const tree = await draw();
    const boxes = (words: string) => find(find(tree, (e) => e.type === "label" && text(e).trim().startsWith(words))!, (e) => e.props.type === "checkbox")!.props.checked;
    expect(boxes("LinkedIn")).toBe(true);
    expect(boxes("Instagram")).toBe(true);
    expect(boxes("TikTok")).toBe(false);
    expect(boxes("@secondDefault")).toBe(true);
    expect(boxes("@first")).toBe(false);
    // Instagram needs a picture or video, and step 1 says so
    expect(text(tree)).toContain("Instagram needs a picture or video.");
  });
});

describe("the one press that posts", () => {
  it("sends a LinkedIn draft to LinkedIn and Facebook as one post with a caption each; nothing but reads runs before the press", async () => {
    fn.answers.status = () => ({ accounts: [acc("li1", "linkedin"), acc("fb1", "facebook")] });
    fn.answers.schedule = () => ({ post: view("scheduled", [{ platform: "linkedin", accountId: "li1", status: "pending" }, { platform: "facebook", accountId: "fb1", status: "pending" }]) });
    mount(draftOf({ versions: { facebook: { caption: "For Facebook" } } }));
    let tree = await draw();
    press(tree, "Next");
    tree = await draw();
    expect(url.params.get("step")).toBe("when");
    expect(text(tree)).toContain("Step 2 of 3 | When");
    press(tree, "Next");
    tree = await draw();
    expect(url.params.get("step")).toBe("caption");
    expect(actions()).toEqual(["status"]);
    expect(text(sendButton(tree))).toBe(`Schedule for ${whenLabel("2030-01-15", "09:00")}`);

    press(tree, /^Schedule for/);
    await settle();
    tree = await draw();
    const key = (fn.calls[1] as { clientKey: string }).clientKey;
    expect(fn.calls[1]).toEqual({
      name: "social",
      action: "schedule",
      profileId: "me",
      accountIds: ["li1", "fb1"],
      clientKey: key,
      content: BASE,
      captions: { facebook: "For Facebook" },
      mediaUrls: [],
      scheduledFor: "2030-01-15T09:00:00+08:00",
      facebook: { placement: "feed" },
    });
    expect(text(tree)).toContain("Scheduled on LinkedIn and Facebook");
    expect(text(tree)).toContain(`${whenLabel("2030-01-15", "09:00")}. The chip on the post shows when it's up.`);
    expect(buttonOf(tree, "Open in calendar")).not.toBeNull();
    // the key went on the draft before the call; the host hears of the post on Done
    expect((props.onDrafts as ReturnType<typeof vi.fn>).mock.calls.map(([l]) => (l as DraftEntry[])[0].zernio)).toEqual([{ key }]);
    press(tree, "Done");
    const last = (props.onDrafts as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as DraftEntry[];
    expect(last[0].zernio).toMatchObject({ key, postId: "zp1", platforms: ["linkedin", "facebook"] });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("a red flag in any tab blocks the send and names the tab; a reload on step 3 opens that tab with the kept captions", async () => {
    fn.answers.status = () => ({ accounts: [acc("li1", "linkedin"), acc("fb1", "facebook")] });
    mount(draftOf({ versions: { facebook: { caption: "It's risk-free." } } }), "step=caption&network=facebook");
    const tree = await draw();
    expect(text(tree)).toContain("Step 3 of 3 | Caption");
    const tabs = find(tree, (e) => e.type === NetworkCaptions)!;
    expect(tabs.props).toMatchObject({ tabs: ["linkedin", "facebook"], open: "facebook", versions: { facebook: { caption: "It's risk-free." } } });
    expect(text(tree)).toContain("Fix the compliance error in the Facebook caption first.");
    expect(sendButton(tree)!.props.disabled).toBe(true);
    expect(actions()).toEqual(["status"]);
  });

  it("typed captions and the first comment ride on the draft, so a reload keeps them", async () => {
    fn.answers.status = () => ({ accounts: [acc("li1", "linkedin"), acc("fb1", "facebook")] });
    mount(draftOf({ versions: { facebook: {} } }), "step=caption");
    const tree = await draw();
    const tabs = find(tree, (e) => e.type === NetworkCaptions)!;
    (tabs.props.onVersions as (v: unknown) => void)({ facebook: { caption: "For Facebook" } });
    const comment = find(tree, (e) => e.props.id === "fc-d1")!;
    (comment.props.onChange as (e: unknown) => void)({ target: { value: "Link: https://x.sg" } });
    await new Promise((r) => setTimeout(r, 450));
    expect(JSON.parse(local.getItem(DRAFTS)!)[0]).toMatchObject({ versions: { facebook: { caption: "For Facebook" } }, firstComment: "Link: https://x.sg" });
    expect(actions()).toEqual(["status"]);
  });

  it("a link to a step the form can't reach yet opens the first blocked step", async () => {
    fn.answers.status = () => ({ accounts: [acc("li1", "linkedin")] });
    mount(draftOf({ platform: "instagram" }), "step=caption");
    const tree = await draw();
    expect(text(tree)).toContain("Step 1 of 3 | Where");
    expect(url.params.has("step")).toBe(false);
  });
});

describe("TikTok", () => {
  const tiktokDraft = () => draftOf({ platform: "tiktok", media: "https://cdn.example.com/clip.mp4" });
  const toCaption = async () => {
    let tree = await draw();
    press(tree, "Next");
    tree = await draw();
    press(tree, "Next");
    return draw();
  };
  beforeEach(() => {
    fn.answers.status = () => ({ accounts: [acc("tt1", "tiktok", "activity_tracker_io")] });
    fn.answers["tiktok-creator-info"] = () => ({ info: INFO });
    fn.answers["account-posts"] = () => ({ posts: [{ id: "a" }, { id: "b" }] });
  });

  it("defaults to Send to inbox on an account with no saved mode, says a new account is new, and sends an inbox draft", async () => {
    fn.answers.schedule = () => ({ post: view("scheduled", [{ platform: "tiktok", accountId: "tt1", status: "pending" }]) });
    mount(tiktokDraft());
    const step1 = await draw();
    expect(find(step1, (e) => e.type === TikTokMode)!.props).toMatchObject({ handle: "activity_tracker_io", mode: "inbox", isNew: true, warmed: false });
    const tree = await toCaption();
    expect(actions()).toEqual(["status", "tiktok-creator-info", "account-posts"]);
    press(tree, /^Schedule for/);
    await settle();
    expect(fn.calls.at(-1)).toMatchObject({
      action: "schedule",
      accountIds: ["tt1"],
      mediaUrls: ["https://cdn.example.com/clip.mp4"],
      tiktok: { privacyLevel: "PUBLIC_TO_EVERYONE", allowComment: true, allowDuet: false, allowStitch: false, mode: "inbox" },
    });
    expect(fn.calls.at(-1)).not.toHaveProperty("firstComment");
    expect(JSON.parse(local.getItem(`content-studio-tiktok-${UID}`)!).tt1).toMatchObject({ mode: "inbox", posts: 2 });
  });

  it("an inbox send that goes now reads Send to inbox and finishes on the inbox screen", async () => {
    fn.answers.schedule = () => ({ post: view("published", [{ platform: "tiktok", accountId: "tt1", status: "published", draft: true }]) });
    mount(tiktokDraft());
    let tree = await draw();
    press(tree, "Next");
    tree = await draw();
    // the When options are their own small component: pick Now through its onPick
    (find(tree, (e) => e.props.label === "Now")!.props.onPick as () => void)();
    tree = await draw();
    press(tree, "Next");
    tree = await draw();
    expect(text(sendButton(tree))).toBe("Send to inbox");
    press(tree, "Send to inbox");
    await settle();
    tree = await draw();
    expect(fn.calls.at(-1)).toMatchObject({ action: "schedule", now: true });
    expect(text(tree)).toContain("Sent to your TikTok inbox");
    expect(text(tree)).toContain("Open TikTok > Inbox > System notifications to finish it.");
    expect(buttonOf(tree, "Copy caption")).not.toBeNull();
  });

  describe("direct posts that fail", () => {
    const direct = async (error: string) => {
      local.setItem(`content-studio-tiktok-${UID}`, JSON.stringify({ tt1: { mode: "direct", warmedAt: "2026-10-01T00:00:00.000Z" } }));
      fn.answers.schedule = () => {
        throw new Error(error);
      };
      mount(tiktokDraft());
      let tree = await toCaption();
      const tabs = find(tree, (e) => e.type === NetworkCaptions)!;
      const fields = (tabs.props.extra as (p: string) => unknown)("tiktok");
      (find(fields, (e) => e.type === "select")!.props.onChange as (e: unknown) => void)({ target: { value: "SELF_ONLY" } });
      tree = await draw();
      press(tree, /^Schedule for/);
      await settle();
      return draw();
    };

    it("TikTok's capacity line offers Send to inbox instead, which goes back to step 1 in inbox mode with a new key", async () => {
      let tree = await direct("TikTok direct posting is at capacity right now");
      expect(text(tree)).toContain(TIKTOK_BUSY);
      expect(text(sendButton(tree))).toBe("Try again");
      const first = fn.calls.at(-1) as { clientKey: string; tiktok: { mode: string } };
      expect(first.tiktok.mode).toBe("direct");
      press(tree, "Send to inbox instead");
      await settle();
      tree = await draw();
      expect(text(tree)).toContain("Step 1 of 3 | Where");
      expect(find(tree, (e) => e.type === TikTokMode)!.props.mode).toBe("inbox");
      press(tree, "Next");
      tree = await draw();
      press(tree, "Next");
      tree = await draw();
      fn.answers.schedule = () => ({ post: view("scheduled", [{ platform: "tiktok", accountId: "tt1", status: "pending" }]) });
      press(tree, /^Schedule for/);
      await settle();
      const second = fn.calls.at(-1) as { clientKey: string; tiktok: { mode: string } };
      expect(second.tiktok.mode).toBe("inbox");
      expect(second.clientKey).not.toBe(first.clientKey);
    });

    it("the 5-drafts and daily-limit failures read in plain words, with no inbox offer", async () => {
      let tree = await direct("TikTok allows only 5 pending drafts per account in any 24-hour period");
      expect(text(tree)).toContain("TikTok holds 5 drafts at most. Finish or delete drafts in the TikTok app, then retry.");
      expect(buttonOf(tree, "Send to inbox instead")).toBeNull();
      tree = await direct("You have created too many posts in the last 24 hours via the API");
      expect(text(tree)).toContain("TikTok's daily limit for this account is reached. Try tomorrow, or post it in the TikTok app.");
    });
  });
});

describe("Post it for me on Leo's sign-in", () => {
  it("renders the steps in place of today's panel, which asks nothing itself; a thread keeps today's panel", async () => {
    const { PostItForMePanel } = await import("./PostItForMe");
    mount(draftOf());
    fn.answers.status = () => ({ accounts: [] });
    const panel = (thread?: string[]) => {
      shim.slots = [];
      shim.deps = [];
      shim.effects = [];
      shim.i = 0;
      shim.e = 0;
      const tree = PostItForMePanel({ ...props, ...(thread ? { thread } : {}) }) as El;
      for (const run of shim.effects.splice(0)) run();
      return tree;
    };
    const tree = panel();
    expect(tree.type).toBe(ScheduleSteps);
    expect(tree.props).toMatchObject({ userId: UID, draft: props.draft, blockReason: null });
    await settle();
    expect(actions()).toEqual([]);
    expect(text(panel(["One.", "Two."]))).toContain("Post it for me");
    await settle();
    expect(actions()).toEqual(["status"]);
  });
});
