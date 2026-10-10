import { describe, expect, it } from "vitest";
import { NotYours, ZernioError, type ZAccount, type Zernio, type ZernioRequest } from "../_shared/zernio";
import { automationErrorReply, checkInput, parseAutomationRequest, platformProblem, runAutomation, settingsBody, type AutomationInput, type AutomationRequest } from "./automations";

const MINE = "0123456789abcdef01234561";
const THEIRS = "0123456789abcdef01234569";
const IG = "65000000000000000000a001";
const TT = "65000000000000000000a002";
const FB = "65000000000000000000a003";
const VICTIM = "65000000000000000000b001";
const AUTO = "66000000000000000000c001";
const THEIR_AUTO = "66000000000000000000c009";

const acct = (id: string, platform: string, profileId = MINE): ZAccount => ({ _id: id, platform, profileId, username: `u${id.slice(-3)}` });
const TEAM = [acct(IG, "instagram"), acct(TT, "tiktok"), acct(FB, "facebook"), acct(VICTIM, "instagram", THEIRS)];

/** A fake Zernio: "METHOD /path" -> answer or a function of the request. An unrouted call fails the test. */
function fake(routes: Record<string, unknown>) {
  const calls: { key: string; req?: ZernioRequest }[] = [];
  const z: Zernio = async (method, path, req) => {
    const key = `${method} ${path}`;
    calls.push({ key, req });
    if (!(key in routes)) throw new Error(`unexpected Zernio call ${key}`);
    const r = routes[key];
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r(req) : r;
  };
  return { z, calls, keys: () => calls.map((c) => c.key), body: (key: string) => calls.find((c) => c.key === key)?.req?.body as Record<string, unknown> };
}

/** GET /accounts answers the profile's own accounts, as Zernio does with profileId. */
const accounts = (req?: ZernioRequest) => ({ accounts: TEAM.filter((a) => a.profileId === req?.query?.profileId) });

const input = (extra: Partial<AutomationInput> = {}): AutomationInput => ({
  trigger: "comment",
  platformPostId: null,
  keywords: ["GUIDE"],
  everyComment: false,
  dm: "Hi {{first_name}}, here is the guide.",
  dmVariations: [],
  buttons: [{ title: "Get the guide", url: "https://example.com/guide" }],
  reply: "Sent it to your DMs!",
  replyVariations: [],
  alsoMatchInDms: false,
  followGate: false,
  ...extra,
});

// Shapes from https://zernio.com/openapi.json (GET /v1/comment-automations/{id}, list items, logs).
const zAuto = (id: string, accountId: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: "GUIDE",
  platform: "instagram",
  trigger: "comment",
  accountId,
  keywords: ["GUIDE"],
  dmMessage: "Hi",
  isActive: true,
  stats: { triggered: 9, dmsSent: 7, dmsFailed: 1, delivered: 0, read: 4, linkClicks: 6, uniqueClicks: 3 },
  ...extra,
});

const create = (accountId: string, i: AutomationInput = input()): AutomationRequest => ({ action: "automation-create", profileId: "me", accountId, input: i });

describe("the request", () => {
  it("answers a malformed id with 404 before any other use (H1)", () => {
    for (const body of [
      { action: "automation-delete", profileId: "me", automationId: `../accounts/${VICTIM}` },
      { action: "automation-update", profileId: "me", automationId: AUTO.toUpperCase(), active: false },
      { action: "automation-logs", profileId: "me" },
      { action: "automation-create", profileId: "me", accountId: "x", automation: input() },
      { action: "account-posts", profileId: "me", accountId: `${IG}/posts` },
      { action: "automations", profileId: "ME!" },
    ]) {
      expect(parseAutomationRequest(body), JSON.stringify(body)).toEqual({ ok: false, status: 404, error: "Not found." });
    }
  });

  it("leaves every other action to the accounts parser", () => {
    expect(parseAutomationRequest({ action: "status" })).toBeNull();
    expect(parseAutomationRequest({ action: "schedule", profileId: "me" })).toBeNull();
    expect(parseAutomationRequest(null)).toBeNull();
  });

  it("reads a pause, an edit and a page of the log", () => {
    expect(parseAutomationRequest({ action: "automation-update", profileId: "me", automationId: AUTO, active: false })).toEqual({
      ok: true,
      req: { action: "automation-update", profileId: "me", automationId: AUTO, input: null, active: false },
    });
    expect(parseAutomationRequest({ action: "automation-update", profileId: "me", automationId: AUTO })).toMatchObject({ ok: false, status: 400 });
    expect(parseAutomationRequest({ action: "automation-update", profileId: "me", automationId: AUTO, automation: input() })).toMatchObject({ ok: true, req: { input: input(), active: null } });
    expect(parseAutomationRequest({ action: "automation-logs", profileId: "me", automationId: AUTO, skip: 50 })).toMatchObject({ ok: true, req: { skip: 50 } });
    for (const skip of [-1, 1.5, "50", 1e9]) expect(parseAutomationRequest({ action: "automation-logs", profileId: "me", automationId: AUTO, skip })).toMatchObject({ req: { skip: 0 } });
  });
});

describe("the form's fields", () => {
  const refused = (extra: Record<string, unknown>) => {
    const r = checkInput({ ...input(), ...extra });
    return r.ok ? null : r.error;
  };

  it("takes up to 10 keywords of up to 50 characters, trimmed and without repeats", () => {
    expect(checkInput({ ...input(), keywords: [" GUIDE ", "guide", "", "Info"] })).toMatchObject({ ok: true, value: { keywords: ["GUIDE", "Info"] } });
    expect(refused({ keywords: Array.from({ length: 11 }, (_, i) => `k${i}`) })).toBe("Use up to 10 keywords.");
    expect(refused({ keywords: ["x".repeat(51)] })).toBe("Keep each keyword under 51 characters.");
    expect(refused({ keywords: ["x".repeat(50)] })).toBeNull();
  });

  it("needs a keyword unless every comment is meant, or it is a story mention", () => {
    expect(refused({ keywords: [] })).toBe("Add a keyword, or tick Every comment.");
    expect(refused({ keywords: [], everyComment: true })).toBeNull();
    expect(refused({ everyComment: true })).toMatch(/leave the keywords empty/);
    expect(refused({ keywords: [], trigger: "story_mention" })).toBeNull();
    expect(refused({ trigger: "story_mention" })).toMatch(/no words/);
    expect(refused({ trigger: "live_comment" })).toMatch(/isn't offered/);
    expect(refused({ trigger: "story_reply", platformPostId: "1789" })).toMatch(/Any post/);
  });

  it("takes up to 3 link buttons, each with a 20-character title and an http(s) link", () => {
    const b = (title: string, url: string) => ({ title, url });
    expect(refused({ buttons: [b("Get it", "javascript:alert(1)")] })).toBe('Add your own link to "Get it", starting with https://.');
    expect(refused({ buttons: [b("Book", "")] })).toMatch(/Add your own link/);
    expect(refused({ buttons: [b("x".repeat(21), "https://a.sg")] })).toMatch(/up to 20 characters/);
    expect(refused({ buttons: Array.from({ length: 4 }, () => b("Go", "https://a.sg")) })).toBe("Use up to 3 link buttons.");
    expect(refused({ buttons: [b("", ""), b("Go", "http://a.sg")] })).toBeNull();
  });

  it("holds the DM to 640 characters with buttons, 1000 without, and up to 3 other wordings", () => {
    expect(refused({ dm: "x".repeat(641) })).toMatch(/under 641 characters when it has link buttons/);
    expect(refused({ dm: "x".repeat(641), buttons: [] })).toBeNull();
    expect(refused({ dm: "x".repeat(1001), buttons: [] })).toMatch(/under 1001/);
    expect(refused({ dmVariations: ["a", "b", "c", "d"] })).toBe("Use up to 3 other wordings of the DM.");
    expect(refused({ dm: "", dmVariations: ["a"] })).toMatch(/Write the DM before/);
    expect(refused({ replyVariations: ["1", "2", "3", "4", "5", "6"] })).toBe("Use up to 5 other wordings of the public reply.");
  });

  it("answers DMs only with a keyword, and never on story replies", () => {
    expect(refused({ alsoMatchInDms: true })).toBeNull();
    expect(refused({ alsoMatchInDms: true, keywords: [], everyComment: true })).toMatch(/needs a keyword/);
    expect(refused({ alsoMatchInDms: true, trigger: "story_reply" })).toMatch(/already arrive as DMs/);
  });

  it("refuses a DM on TikTok, Threads, LinkedIn and YouTube in plain words, and needs the public reply there", () => {
    const replyOnly = input({ dm: "", buttons: [] });
    for (const p of ["tiktok", "threads", "linkedin", "youtube"]) {
      expect(platformProblem(input(), p), p).toMatch(/can't send a DM from a comment, only a public reply/);
      expect(platformProblem(input({ dm: "", buttons: [], followGate: true }), p), p).toMatch(/can't send a DM/);
      expect(platformProblem(replyOnly, p), p).toBeNull();
      expect(platformProblem({ ...replyOnly, reply: "" }, p), p).toMatch(/public reply only, so write one/);
    }
    expect(platformProblem(input({ dm: "" }), "instagram")).toBe("Write the DM they get.");
    expect(platformProblem(input({ followGate: true }), "facebook")).toBe("The follower check works on Instagram only.");
    expect(platformProblem(input({ trigger: "story_reply" }), "facebook")).toMatch(/Instagram only/);
    expect(platformProblem(input(), "twitter")).toMatch(/doesn't work/);
  });

  it("sends the follow gate as Zernio's verify rule, Instagram only", () => {
    expect(settingsBody(input({ followGate: true }), "instagram", "create").audience).toEqual({ followerStatus: "follower", whenUnknown: "verify" });
    expect(settingsBody(input(), "instagram", "create")).not.toHaveProperty("audience");
    expect(settingsBody(input(), "instagram", "update").audience).toEqual({ followerStatus: "any", whenUnknown: "send" });
    expect(settingsBody(input(), "facebook", "update")).not.toHaveProperty("audience");
    expect(settingsBody(input({ followGate: true }), "facebook", "create")).not.toHaveProperty("audience");
    // a story has no public reply
    expect(settingsBody(input({ trigger: "story_reply" }), "instagram", "create")).not.toHaveProperty("commentReply");
  });
});

describe("listing", () => {
  it("lists by the brand's profile and drops anything on another adviser's account (H3)", async () => {
    const f = fake({
      "GET /accounts": accounts,
      "GET /comment-automations": { success: true, automations: [zAuto(AUTO, IG), zAuto(THEIR_AUTO, VICTIM), zAuto("bad", IG)] },
    });
    const r = await runAutomation(f.z, MINE, { action: "automations", profileId: "me" });
    expect(f.calls[1].req?.query?.profileId).toBe(MINE);
    expect((r.body.automations as { id: string }[]).map((a) => a.id)).toEqual([AUTO]);
    expect((r.body.accounts as { id: string }[]).map((a) => a.id)).toEqual([IG, TT, FB]);
    expect((r.body.automations as unknown[])[0]).toMatchObject({ active: true, everyComment: false, stats: { sent: 7, read: 4, clicked: 3, failed: 1, triggered: 9 } });
  });

  it("answers an empty list before the brand's first connect, and refuses every other action", async () => {
    const f = fake({});
    expect((await runAutomation(f.z, null, { action: "automations", profileId: "me" })).body).toEqual({ accounts: [], automations: [] });
    await expect(runAutomation(f.z, null, create(IG))).rejects.toBeInstanceOf(NotYours);
    expect(f.calls).toEqual([]);
  });

  it("lists an account's latest posts only for the caller's account, with https pictures only", async () => {
    const f = fake({
      "GET /accounts": accounts,
      [`GET /accounts/${IG}/posts`]: { status: "success", posts: [{ id: "1789_1", message: "CPF top-ups", picture: "https://cdn.sg/p.jpg", permalink: "javascript:x" }, { id: "../x" }] },
    });
    expect((await runAutomation(f.z, MINE, { action: "account-posts", profileId: "me", accountId: IG })).body.posts).toEqual([
      { id: "1789_1", caption: "CPF top-ups", picture: "https://cdn.sg/p.jpg", url: null, at: "" },
    ]);
    const g = fake({ "GET /accounts": accounts });
    await expect(runAutomation(g.z, MINE, { action: "account-posts", profileId: "me", accountId: VICTIM })).rejects.toBeInstanceOf(NotYours);
    expect(g.keys()).toEqual(["GET /accounts"]);
  });
});

describe("creating", () => {
  it("sends the brand's own Zernio profile, whatever the request carried", async () => {
    const f = fake({ "GET /accounts": accounts, "POST /comment-automations": { success: true, automation: { id: AUTO } } });
    expect((await runAutomation(f.z, MINE, create(IG))).body).toEqual({ id: AUTO });
    expect(f.body("POST /comment-automations")).toMatchObject({
      profileId: MINE,
      accountId: IG,
      name: "GUIDE",
      trigger: "comment",
      keywords: ["GUIDE"],
      matchMode: "word",
      dmMessage: "Hi {{first_name}}, here is the guide.",
      buttons: [{ type: "url", title: "Get the guide", url: "https://example.com/guide" }],
      commentReply: "Sent it to your DMs!",
      alsoMatchInDms: false,
    });
    expect(f.body("POST /comment-automations")).not.toHaveProperty("platformPostId");
  });

  it("refuses another adviser's account before anything is written", async () => {
    const f = fake({ "GET /accounts": accounts });
    await expect(runAutomation(f.z, MINE, create(VICTIM))).rejects.toBeInstanceOf(NotYours);
    expect(f.keys()).toEqual(["GET /accounts"]);
  });

  it("refuses a DM on a TikTok account itself, before Zernio's 400", async () => {
    const f = fake({ "GET /accounts": accounts });
    const r = await runAutomation(f.z, MINE, create(TT));
    expect(r).toEqual({ status: 400, body: { error: "TikTok can't send a DM from a comment, only a public reply. Remove the DM, link buttons, DM keyword and follower check." } });
    expect(f.keys()).toEqual(["GET /accounts"]);
    const g = fake({ "GET /accounts": accounts, "POST /comment-automations": { automation: { id: AUTO } } });
    await runAutomation(g.z, MINE, create(TT, input({ dm: "", buttons: [] })));
    expect(Object.keys(g.body("POST /comment-automations")).sort()).toEqual(["accountId", "commentReply", "commentReplyVariations", "keywords", "matchMode", "name", "profileId", "trigger"]);
  });

  it("binds one post only when it is among the account's own latest posts", async () => {
    const posts = { posts: [{ id: "1789_1", message: "Three CPF moves\nbefore December" }] };
    const f = fake({ "GET /accounts": accounts, [`GET /accounts/${IG}/posts`]: posts, "POST /comment-automations": { automation: { id: AUTO } } });
    await runAutomation(f.z, MINE, create(IG, input({ platformPostId: "1789_1" })));
    expect(f.body("POST /comment-automations")).toMatchObject({ platformPostId: "1789_1", postTitle: "Three CPF moves before December" });
    const g = fake({ "GET /accounts": accounts, [`GET /accounts/${IG}/posts`]: posts });
    await expect(runAutomation(g.z, MINE, create(IG, input({ platformPostId: "1790_9" })))).rejects.toBeInstanceOf(NotYours);
    expect(g.keys().some((k) => k.startsWith("POST"))).toBe(false);
  });
});

describe("changing one (M1)", () => {
  const routes = (automation: unknown, extra: Record<string, unknown> = {}) => ({ "GET /accounts": accounts, [`GET /comment-automations/${AUTO}`]: { success: true, automation, logs: [] }, ...extra });

  it("answers another adviser's automation with 404 before any write, for every change", async () => {
    for (const q of [
      { action: "automation-update", profileId: "me", automationId: AUTO, input: null, active: false },
      { action: "automation-update", profileId: "me", automationId: AUTO, input: input(), active: null },
      { action: "automation-delete", profileId: "me", automationId: AUTO },
      { action: "automation-logs", profileId: "me", automationId: AUTO, skip: 0 },
    ] as AutomationRequest[]) {
      const f = fake(routes(zAuto(AUTO, VICTIM)));
      await expect(runAutomation(f.z, MINE, q), q.action).rejects.toBeInstanceOf(NotYours);
      expect(f.keys(), q.action).toEqual(["GET /accounts", `GET /comment-automations/${AUTO}`]);
    }
    // one Zernio says doesn't exist reads the same
    const gone = fake({ "GET /accounts": accounts, [`GET /comment-automations/${AUTO}`]: new ZernioError(404, "", "nope") });
    await expect(runAutomation(gone.z, MINE, { action: "automation-delete", profileId: "me", automationId: AUTO })).rejects.toBeInstanceOf(NotYours);
  });

  it("pauses with isActive alone", async () => {
    const f = fake(routes(zAuto(AUTO, IG), { [`PATCH /comment-automations/${AUTO}`]: { success: true } }));
    expect((await runAutomation(f.z, MINE, { action: "automation-update", profileId: "me", automationId: AUTO, input: null, active: false })).body).toEqual({ active: false });
    expect(f.body(`PATCH /comment-automations/${AUTO}`)).toEqual({ isActive: false });
  });

  it("keeps the post binding unless it changed, and clears all three parts for Any post", async () => {
    const bound = zAuto(AUTO, IG, { platformPostId: "1789_1", postTitle: "Old" });
    const same = fake(routes(bound, { [`PATCH /comment-automations/${AUTO}`]: {} }));
    await runAutomation(same.z, MINE, { action: "automation-update", profileId: "me", automationId: AUTO, input: input({ platformPostId: "1789_1" }), active: null });
    expect(same.body(`PATCH /comment-automations/${AUTO}`)).not.toHaveProperty("platformPostId");
    expect(same.body(`PATCH /comment-automations/${AUTO}`)).not.toHaveProperty("matchMode");
    const any = fake(routes(bound, { [`PATCH /comment-automations/${AUTO}`]: {} }));
    await runAutomation(any.z, MINE, { action: "automation-update", profileId: "me", automationId: AUTO, input: input(), active: null });
    expect(any.body(`PATCH /comment-automations/${AUTO}`)).toMatchObject({ platformPostId: null, postId: null, postTitle: null, commentReply: "Sent it to your DMs!" });
  });

  it("refuses a DM on a YouTube automation with the same plain words", async () => {
    const f = fake(routes(zAuto(AUTO, TT, { platform: "tiktok" })));
    expect((await runAutomation(f.z, MINE, { action: "automation-update", profileId: "me", automationId: AUTO, input: input(), active: null })).status).toBe(400);
    expect(f.keys().some((k) => k.startsWith("PATCH"))).toBe(false);
  });

  it("deletes a checked automation", async () => {
    const f = fake(routes(zAuto(AUTO, FB), { [`DELETE /comment-automations/${AUTO}`]: {} }));
    expect((await runAutomation(f.z, MINE, { action: "automation-delete", profileId: "me", automationId: AUTO })).body).toEqual({ deleted: true });
  });

  it("reads who got it a page at a time", async () => {
    const f = fake(
      routes(zAuto(AUTO, IG), {
        [`GET /comment-automations/${AUTO}/logs`]: {
          success: true,
          logs: [
            { id: "l1", commenterUsername: "sarah.tan", commentText: "GUIDE pls", status: "sent", commentReplyStatus: "sent", clickCount: 2, createdAt: "2026-10-11T02:00:00Z" },
            { id: "l2", commenterName: "Wei Ming", commenterUsername: null, commentText: "guide", status: "failed", error: "User has DMs off", commentReplyStatus: "skipped" },
          ],
          pagination: { total: 51, limit: 50, skip: 50, hasMore: false },
        },
      }),
    );
    const r = await runAutomation(f.z, MINE, { action: "automation-logs", profileId: "me", automationId: AUTO, skip: 50 });
    expect(f.calls[2].req?.query).toEqual({ limit: "50", skip: "50" });
    expect(r.body).toMatchObject({ hasMore: false, total: 51 });
    expect(r.body.logs).toEqual([
      { id: "l1", who: "@sarah.tan", said: "GUIDE pls", status: "sent", reason: "", reply: "sent", replyReason: "", at: "2026-10-11T02:00:00Z", clicked: true },
      { id: "l2", who: "Wei Ming", said: "guide", status: "failed", reason: "User has DMs off", reply: "skipped", replyReason: "", at: "", clicked: false },
    ]);
  });
});

describe("errors", () => {
  it("says what Zernio refused in plain words, and leaves the rest to the shared reply", () => {
    expect(automationErrorReply(new ZernioError(409, "", "exists"))).toMatchObject({ status: 409, body: { code: "post_taken" } });
    expect(automationErrorReply(new ZernioError(401, "TOKEN_EXPIRED", "x"))).toMatchObject({ status: 409, body: { code: "reconnect" } });
    expect(automationErrorReply(new ZernioError(400, "invalid_field_value", "dmMessage sk_x"))).toEqual({
      status: 400,
      body: { code: "invalid_field_value", error: "Zernio didn't accept that auto-DM. Check the fields and try again." },
    });
    expect(automationErrorReply(new ZernioError(401, "invalid_credentials", "key"))).toBeNull();
    expect(automationErrorReply(new NotYours("x"))).toBeNull();
  });
});
