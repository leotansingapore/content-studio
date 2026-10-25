import { afterEach, describe, expect, it, vi } from "vitest";
import { NotYours, ZernioError, type ZAccount, type Zernio, type ZernioRequest } from "../_shared/zernio";
import { PDF_LINKEDIN_ONLY, THREAD_MIXED, checkSchedule, checkUpload, isPdf, northStarOnly, parsePostRequest, platformProblem, postBody, postErrorReply, runPost, type PostRequest, type ScheduleInput } from "./posts";

const MINE = "0123456789abcdef01234561";
const THEIRS = "0123456789abcdef01234569";
const IG = "65000000000000000000a001";
const TT = "65000000000000000000a002";
const YT = "65000000000000000000a003";
const LI = "65000000000000000000a004";
const VICTIM = "65000000000000000000b001";
const POST = "67000000000000000000d001";
const THEIR_POST = "67000000000000000000d009";
const UID = "11111111-2222-4333-8444-555555555555";
const OTHER_UID = "99999999-2222-4333-8444-555555555555";
const KEY = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const NOW = Date.parse("2026-10-11T02:00:00Z");
const LATER = "2026-10-12T09:00:00+08:00";
const PNG = "https://media.zernio.com/temp/1_a_slide-01.png";
const MP4 = "https://media.zernio.com/temp/1_a_reel.mp4";

const acct = (id: string, platform: string, profileId = MINE): ZAccount => ({ _id: id, platform, profileId, username: `u${id.slice(-3)}` });
const TEAM = [acct(IG, "instagram"), acct(TT, "tiktok"), acct(YT, "youtube"), acct(LI, "linkedin"), acct(VICTIM, "instagram", THEIRS)];

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
  return { z, calls, keys: () => calls.map((c) => c.key), req: (key: string) => calls.find((c) => c.key === key)?.req };
}

/** GET /accounts answers the profile's own accounts, as Zernio does with profileId. */
const accounts = (req?: ZernioRequest) => ({ accounts: TEAM.filter((a) => a.profileId === req?.query?.profileId) });

// Shape from https://zernio.com/openapi.json (Post, PlatformTarget).
const zPost = (id: string, accountIds: string[], extra: Record<string, unknown> = {}) => ({
  post: {
    _id: id,
    status: "scheduled",
    scheduledFor: "2026-10-12T01:00:00.000Z",
    platforms: accountIds.map((a) => ({ platform: TEAM.find((t) => t._id === a)?.platform ?? "instagram", accountId: a, status: "pending" })),
    ...extra,
  },
});

const input = (extra: Partial<ScheduleInput> = {}): ScheduleInput => ({
  clientKey: KEY,
  content: "Three things to check before you renew.",
  captions: {},
  mediaUrls: [PNG],
  scheduledFor: LATER,
  firstComment: "",
  tiktok: null,
  youtube: null,
  ...extra,
});
const schedule = (accountIds: string[], i: ScheduleInput = input()): PostRequest => ({ action: "schedule", profileId: "me", accountIds, input: i });

describe("the request", () => {
  it("answers a malformed id with 404 before any other use (H1)", () => {
    for (const body of [
      { action: "cancel", profileId: "me", postId: `../accounts/${VICTIM}` },
      { action: "post", profileId: "me", postId: POST.toUpperCase() },
      { action: "retry", profileId: "me" },
      { action: "tiktok-creator-info", profileId: "me", accountId: `${TT}/x` },
      { action: "schedule", profileId: "me", accountIds: [IG, "x"], clientKey: KEY, content: "hi", scheduledFor: LATER },
      { action: "presign", profileId: "ME!", filename: "a.png", contentType: "image/png", size: 10 },
    ]) {
      expect(parsePostRequest(body, NOW), JSON.stringify(body)).toEqual({ ok: false, status: 404, error: "Not found." });
    }
  });

  it("leaves every other action to the other parsers", () => {
    expect(parsePostRequest({ action: "status" })).toBeNull();
    expect(parsePostRequest({ action: "automations", profileId: "me" })).toBeNull();
    expect(parsePostRequest(null)).toBeNull();
  });

  it("needs an account and a client key that is a UUID", () => {
    expect(parsePostRequest({ action: "schedule", profileId: "me", accountIds: [], clientKey: KEY, scheduledFor: LATER }, NOW)).toMatchObject({ status: 400 });
    expect(checkSchedule({ clientKey: `${KEY}:x`, content: "hi", scheduledFor: LATER }, NOW)).toEqual({ error: "Close this and try again." });
    expect(checkSchedule({ clientKey: KEY.toUpperCase(), content: "hi", scheduledFor: LATER }, NOW)).toMatchObject({ value: { clientKey: KEY } });
  });

  it("takes a future time with an offset, or now; never a past or made-up time", () => {
    const at = (scheduledFor: unknown, extra = {}) => checkSchedule({ clientKey: KEY, content: "hi", scheduledFor, ...extra }, NOW);
    expect(at(LATER)).toMatchObject({ value: { scheduledFor: LATER } });
    expect(at("2026-10-12T01:00:00Z")).toMatchObject({ value: { scheduledFor: "2026-10-12T01:00:00Z" } });
    expect(at(undefined, { now: true })).toMatchObject({ value: { scheduledFor: null } });
    // no offset: Zernio would read it in some other zone
    for (const bad of ["2026-10-12T09:00:00", "2026-10-12 09:00+08:00", "2026-10-12T24:00:00+08:00", "2026-10-12T19:60:00+08:00", "tomorrow", 1760230000000]) {
      expect(at(bad), String(bad)).toEqual({ error: "Pick the day and time again." });
    }
    // in the past, or so close that Zernio would publish it inside the call
    expect(at("2026-10-11T09:59:00+08:00")).toMatchObject({ error: expect.stringMatching(/has passed/) });
    expect(at("2026-10-11T10:00:30+08:00")).toMatchObject({ error: expect.stringMatching(/has passed/) });
  });

  it("takes https media as one video or up to 10 pictures", () => {
    const media = (mediaUrls: unknown[]) => checkSchedule({ clientKey: KEY, content: "hi", scheduledFor: LATER, mediaUrls }, NOW);
    expect(media([PNG, PNG])).toMatchObject({ value: { mediaUrls: [PNG, PNG] } });
    expect(media([MP4])).toMatchObject({ value: { mediaUrls: [MP4] } });
    for (const bad of [["http://media.zernio.com/a.png"], ["https://x.com/a.gif"], ["javascript:alert(1)"], [3]]) expect(media(bad)).toEqual({ error: "Attach the media again." });
    expect(media([MP4, PNG])).toEqual({ error: "Post one video, or up to 10 pictures." });
    expect(media([MP4, MP4])).toEqual({ error: "Post one video, or up to 10 pictures." });
    expect(media(Array(11).fill(PNG))).toEqual({ error: "Post up to 10 pictures." });
  });

  it("checks an upload's type, name and size against the app's caps", () => {
    const up = (filename: string, contentType: string, size: unknown) => checkUpload({ filename, contentType, size });
    expect(up("slide-01.png", "image/png", 900_000)).toEqual({ value: { filename: "slide-01.png", contentType: "image/png", size: 900_000 } });
    expect(up("reel.mov", "video/quicktime", 299_000_000)).toMatchObject({ value: {} });
    expect(up("a.gif", "image/gif", 10)).toMatchObject({ error: expect.stringMatching(/JPG, PNG or WebP/) });
    // a PDF passes the type check up to 20 MB; runPost refuses it for anyone off NORTH_STAR_USERS
    expect(up("carousel-1.pdf", "application/pdf", 20_000_000)).toMatchObject({ value: { contentType: "application/pdf" } });
    expect(up("carousel-1.pdf", "application/pdf", 20_000_001)).toMatchObject({ error: "Keep a PDF under 20 MB." });
    expect(up("a.png", "application/pdf", 10)).toMatchObject({ error: expect.stringMatching(/Rename/) });
    expect(up("a.png", "image/jpeg", 10)).toMatchObject({ error: expect.stringMatching(/Rename/) });
    expect(up("../a.png", "image/png", 10)).toMatchObject({ error: expect.stringMatching(/Rename/) });
    expect(up("a.png", "image/png", 8_000_001)).toMatchObject({ error: "Keep a picture under 8 MB." });
    expect(up("a.mp4", "video/mp4", 300_000_001)).toMatchObject({ error: "Keep a video under 300 MB." });
    expect(up("a.mp4", "video/mp4", 0)).toMatchObject({ error: "That file is empty." });
    expect(up("a.mp4", "video/mp4", "5")).toMatchObject({ error: "That file is empty." });
  });
});

describe("what each platform takes", () => {
  it("refuses before Zernio does", () => {
    expect(platformProblem(input({ mediaUrls: [] }), ["linkedin"])).toBeNull();
    expect(platformProblem(input({ mediaUrls: [] }), ["instagram"])).toBe("Instagram needs a picture or video.");
    expect(platformProblem(input({ mediaUrls: [], content: "" }), ["linkedin"])).toBe("Write the caption, or attach a picture or video.");
    expect(platformProblem(input(), ["youtube"])).toBe("YouTube takes one video.");
    expect(platformProblem(input({ mediaUrls: [MP4] }), ["youtube"])).toBeNull();
    expect(platformProblem(input(), ["tiktok"])).toBe("Pick who can see it on TikTok.");
    expect(platformProblem(input({ content: "x".repeat(501) }), ["linkedin", "threads"])).toBe("Keep the Threads caption under 501 characters.");
    expect(platformProblem(input({ content: "x".repeat(501), captions: { threads: "short" } }), ["linkedin", "threads"])).toBeNull();
    expect(platformProblem(input({ mediaUrls: ["https://media.zernio.com/a.webp"] }), ["instagram"])).toBe("Instagram takes JPG or PNG pictures.");
    expect(platformProblem(input({ mediaUrls: ["https://media.zernio.com/a.mov"] }), ["threads"])).toBe("Threads takes MP4 videos.");
    expect(platformProblem(input(), [])).toBe("Pick an account to post to.");
    expect(platformProblem(input(), ["twitter"])).toBe("Posting doesn't work on that account.");
  });

  it("builds the post: per platform captions, TikTok's switches and consent, YouTube's title, Singapore time", () => {
    const tiktok = { privacyLevel: "PUBLIC_TO_EVERYONE", allowComment: true, allowDuet: false, allowStitch: true };
    const body = postBody(input({ mediaUrls: [MP4], captions: { tiktok: "Short one" }, tiktok, youtube: { title: "Renewals", visibility: "unlisted" }, firstComment: "Link: https://x.sg" }), [
      { _id: TT, platform: "tiktok" },
      { _id: YT, platform: "youtube" },
    ]);
    expect(body).toEqual({
      content: "Three things to check before you renew.",
      mediaItems: [{ url: MP4 }],
      platforms: [
        {
          platform: "tiktok",
          accountId: TT,
          customContent: "Short one",
          platformSpecificData: { privacyLevel: "PUBLIC_TO_EVERYONE", allowComment: true, allowDuet: false, allowStitch: true, contentPreviewConfirmed: true, expressConsentGiven: true },
        },
        {
          platform: "youtube",
          accountId: YT,
          customContent: "Three things to check before you renew.",
          platformSpecificData: { visibility: "unlisted", madeForKids: false, title: "Renewals", firstComment: "Link: https://x.sg" },
        },
      ],
      scheduledFor: LATER,
      timezone: "Asia/Singapore",
    });
  });

  it("puts a TikTok photo post's caption in description, and sends now as a minute ahead", () => {
    const body = postBody(input({ scheduledFor: null, tiktok: { privacyLevel: "SELF_ONLY", allowComment: false, allowDuet: true, allowStitch: true } }), [{ _id: TT, platform: "tiktok" }], NOW);
    expect(body.scheduledFor).toBe("2026-10-11T02:01:00.000Z");
    expect(body).not.toHaveProperty("publishNow");
    const data = (body.platforms as { platformSpecificData: Record<string, unknown> }[])[0].platformSpecificData;
    expect(data).toMatchObject({ description: "Three things to check before you renew.", allowComment: false });
    expect(data).not.toHaveProperty("allowDuet");
  });
});

describe("pinned: today's bodies, byte for byte (phase 7a must not change them)", () => {
  const FB = "65000000000000000000a006";
  const slides = Array.from({ length: 7 }, (_, i) => `https://media.zernio.com/temp/1_a_slide-0${i + 1}.png`);
  const at = '"scheduledFor":"2026-10-12T09:00:00+08:00","timezone":"Asia/Singapore"}';
  const text = '"content":"Three things to check before you renew."';

  it("a direct TikTok photo post: the flat platformSpecificData that published live on 17 Oct 2026", () => {
    const body = postBody(input({ mediaUrls: slides, tiktok: { privacyLevel: "PUBLIC_TO_EVERYONE", allowComment: true, allowDuet: false, allowStitch: false } }), [{ _id: TT, platform: "tiktok" }]);
    expect(JSON.stringify(body)).toBe(
      `{${text},"mediaItems":[${slides.map((url) => `{"url":"${url}"}`).join(",")}],"platforms":[{"platform":"tiktok","accountId":"${TT}","customContent":"Three things to check before you renew.","platformSpecificData":{"privacyLevel":"PUBLIC_TO_EVERYONE","allowComment":true,"contentPreviewConfirmed":true,"expressConsentGiven":true,"description":"Three things to check before you renew."}}],${at}`,
    );
  });

  it("a direct TikTok video post", () => {
    const body = postBody(input({ mediaUrls: [MP4], tiktok: { privacyLevel: "PUBLIC_TO_EVERYONE", allowComment: true, allowDuet: false, allowStitch: true } }), [{ _id: TT, platform: "tiktok" }]);
    expect(JSON.stringify(body)).toBe(
      `{${text},"mediaItems":[{"url":"${MP4}"}],"platforms":[{"platform":"tiktok","accountId":"${TT}","customContent":"Three things to check before you renew.","platformSpecificData":{"privacyLevel":"PUBLIC_TO_EVERYONE","allowComment":true,"contentPreviewConfirmed":true,"expressConsentGiven":true,"allowDuet":false,"allowStitch":true}}],${at}`,
    );
  });

  it("a one-platform Instagram post with a first comment", () => {
    const two = "https://media.zernio.com/temp/1_a_slide-02.png";
    const body = postBody(input({ mediaUrls: [PNG, two], firstComment: "Link in bio" }), [{ _id: IG, platform: "instagram" }]);
    expect(JSON.stringify(body)).toBe(
      `{${text},"mediaItems":[{"url":"${PNG}"},{"url":"${two}"}],"platforms":[{"platform":"instagram","accountId":"${IG}","customContent":"Three things to check before you renew.","platformSpecificData":{"firstComment":"Link in bio"}}],${at}`,
    );
  });

  it("a LinkedIn and Facebook post with a caption each, as customContent per entry", () => {
    const body = postBody(input({ mediaUrls: [], captions: { linkedin: "The LinkedIn one, a little longer.", facebook: "The Facebook one." } }), [
      { _id: LI, platform: "linkedin" },
      { _id: FB, platform: "facebook" },
    ]);
    expect(JSON.stringify(body)).toBe(
      `{${text},"mediaItems":[],"platforms":[{"platform":"linkedin","accountId":"${LI}","customContent":"The LinkedIn one, a little longer."},{"platform":"facebook","accountId":"${FB}","customContent":"The Facebook one."}],${at}`,
    );
  });
});

// Fixtures copy https://docs.zernio.com/platforms/tiktok/fields.mdx and
// https://docs.zernio.com/platforms/tiktok/posts.mdx#draft-delivery (read 2026-10-25): draft: true sends the media
// to the creator's inbox; settings sit in the entry's platformSpecificData.tiktokSettings (camelCase accepted); a
// delivered draft comes back published, with platformSpecificData.isDraft: true and no platformPostUrl.
describe("TikTok inbox mode (publish-tiktok, Leo only)", () => {
  const tiktok = { privacyLevel: "SELF_ONLY", allowComment: false, allowDuet: true, allowStitch: true };
  const both = [
    { _id: TT, platform: "tiktok" },
    { _id: IG, platform: "instagram" },
  ];
  const entries = (b: Record<string, unknown>) => b.platforms as { platform: string; platformSpecificData?: Record<string, unknown> }[];

  it("puts every TikTok field in tiktokSettings with draft: true, on the TikTok entry only", () => {
    const direct = postBody(input({ tiktok, firstComment: "Link in bio" }), both);
    const inbox = postBody(input({ tiktok: { ...tiktok, mode: "inbox" }, firstComment: "Link in bio" }), both);
    expect(entries(inbox)[0].platformSpecificData).toEqual({
      tiktokSettings: { draft: true, privacyLevel: "SELF_ONLY", allowComment: true, contentPreviewConfirmed: true, expressConsentGiven: true, description: "Three things to check before you renew." },
    });
    // the Instagram entry and the root are as a direct send has them
    expect(JSON.stringify(entries(inbox)[1])).toBe(JSON.stringify(entries(direct)[1]));
    const { platforms: _a, ...rootInbox } = inbox;
    const { platforms: _b, ...rootDirect } = direct;
    expect(rootInbox).toEqual(rootDirect);
    expect(inbox).not.toHaveProperty("tiktokSettings");
  });

  it("sends a video draft with comments on and no duet or stitch: the fields page lists them as required", () => {
    const b = postBody(input({ mediaUrls: [MP4], tiktok: { ...tiktok, mode: "inbox" } }), [{ _id: TT, platform: "tiktok" }]);
    expect(entries(b)[0].platformSpecificData).toEqual({
      tiktokSettings: { draft: true, privacyLevel: "SELF_ONLY", allowComment: true, contentPreviewConfirmed: true, expressConsentGiven: true, allowDuet: false, allowStitch: false },
    });
  });

  it("reads mode inbox only; direct or anything else is today's direct post", () => {
    const sched = (mode: unknown) => checkSchedule({ clientKey: KEY, content: "hi", scheduledFor: LATER, tiktok: { ...tiktok, mode } }, NOW);
    expect(sched("inbox")).toMatchObject({ value: { tiktok: { mode: "inbox" } } });
    for (const mode of ["direct", "INBOX", true, undefined]) {
      const r = sched(mode) as { value: ScheduleInput };
      expect(r.value.tiktok, String(mode)).toEqual(tiktok);
      expect(JSON.stringify(postBody(r.value, [{ _id: TT, platform: "tiktok" }])), String(mode)).toBe(JSON.stringify(postBody(input({ content: "hi", mediaUrls: [], tiktok }), [{ _id: TT, platform: "tiktok" }])));
    }
  });

  it("drops the mode for a caller off NORTH_STAR_USERS before anything is checked (decision 3)", () => {
    const body = { action: "schedule", profileId: "me", accountIds: [TT], clientKey: KEY, content: "hi", scheduledFor: LATER, tiktok: { ...tiktok, mode: "inbox" } };
    expect(parsePostRequest(body, NOW, true)).toMatchObject({ ok: true, req: { input: { tiktok: { mode: "inbox" } } } });
    for (const off of [parsePostRequest(body, NOW, false), parsePostRequest(body, NOW)]) {
      expect((off as { req: { input: ScheduleInput } }).req.input.tiktok).toEqual(tiktok);
    }
  });

  it("reads a delivered draft as draft, not as a live post", async () => {
    const delivered = zPost(POST, [TT, IG], {
      status: "published",
      platforms: [
        { platform: "tiktok", accountId: TT, status: "published", platformSpecificData: { isDraft: true } },
        { platform: "instagram", accountId: IG, status: "published", platformPostUrl: "https://www.instagram.com/p/abc/", platformSpecificData: { isDraft: "true" } },
      ],
    });
    const f = fake({ "GET /accounts": accounts, [`GET /posts/${POST}`]: delivered });
    const view = (await runPost(f.z, MINE, UID, { action: "post", profileId: "me", postId: POST })).body.post as { platforms: { platform: string; draft: boolean; url: string | null }[] };
    expect(view.platforms.map((p) => [p.platform, p.draft, p.url])).toEqual([
      ["tiktok", true, null],
      ["instagram", false, "https://www.instagram.com/p/abc/"],
    ]);
  });
});

// Fixtures copy https://docs.zernio.com/platforms/instagram/fields.mdx, https://docs.zernio.com/platforms/facebook/posts.mdx
// and https://docs.zernio.com/platforms/linkedin/fields.mdx (read 2026-10-25): Instagram contentType "story" (omit
// otherwise), shareToFeed and trialParams for Reels, up to 3 collaborators, commentsEnabled false; Facebook
// contentType "story" or "reel"; a LinkedIn poll of 1-140 characters, 2-4 options of 1-30, ONE_DAY to FOURTEEN_DAYS.
describe("each network's own options (publish-per-network, Leo only)", () => {
  const FB = "65000000000000000000a006";
  const sched = (extra: Record<string, unknown>) => checkSchedule({ clientKey: KEY, content: "hi", scheduledFor: LATER, mediaUrls: [MP4], ...extra }, NOW);
  const poll = (p: Record<string, unknown>) => sched({ mediaUrls: [], linkedin: { poll: { question: "Which do you check first?", options: ["Premiums", "Cover"], ...p } } });
  const data = (i: ScheduleInput, platform: string, id = IG) => (postBody(i, [{ _id: id, platform }]).platforms as { platformSpecificData?: Record<string, unknown> }[])[0].platformSpecificData;

  it("reads Instagram's placement, feed sharing, trial, collaborators and comments", () => {
    expect(sched({ instagram: { placement: "reel", shareToFeed: false, trial: true, collaborators: ["@moneybees", " leo.tan_sg "], commentsOff: true } })).toMatchObject({
      value: { instagram: { placement: "reel", shareToFeed: false, trial: true, collaborators: ["moneybees", "leo.tan_sg"], commentsOff: true } },
    });
    // defaults stay out of the input
    expect((sched({ instagram: { placement: "feed", shareToFeed: true, trial: false, collaborators: [], commentsOff: false } }) as { value: ScheduleInput }).value.instagram).toEqual({ placement: "feed" });
    expect(sched({ instagram: { placement: "carousel" } })).toEqual({ error: "Pick Feed, Reel or Story for Instagram." });
    expect(sched({ instagram: { placement: "feed", collaborators: ["a", "b", "c", "d"] } })).toEqual({ error: "Add up to 3 collaborators." });
    for (const bad of ["leo tan", "leo/tan", "x".repeat(31), "@"]) {
      expect(sched({ instagram: { placement: "feed", collaborators: [bad] } }), bad).toEqual({ error: "Check the collaborators: an Instagram username has letters, numbers, dots and underscores." });
    }
  });

  it("reads Facebook's placement and LinkedIn's poll, and refuses a poll Zernio would", () => {
    expect(sched({ facebook: { placement: "reel" } })).toMatchObject({ value: { facebook: { placement: "reel" } } });
    expect(sched({ facebook: { placement: "live" } })).toEqual({ error: "Pick Feed, Reel or Story for Facebook." });
    expect(poll({})).toMatchObject({ value: { linkedin: { poll: { question: "Which do you check first?", options: ["Premiums", "Cover"], days: 7 } } } });
    expect(poll({ days: 14, options: [" Premiums ", "Cover", "Exclusions", "Waiting time"] })).toMatchObject({ value: { linkedin: { poll: { options: ["Premiums", "Cover", "Exclusions", "Waiting time"], days: 14 } } } });
    expect(poll({ question: "" })).toEqual({ error: "Write the poll question in 140 characters or fewer." });
    expect(poll({ question: "x".repeat(141) })).toEqual({ error: "Write the poll question in 140 characters or fewer." });
    expect(poll({ options: ["Only one"] })).toEqual({ error: "Give the poll 2 to 4 options." });
    expect(poll({ options: ["a", "b", "c", "d", "e"] })).toEqual({ error: "Give the poll 2 to 4 options." });
    expect(poll({ options: ["a", " "] })).toEqual({ error: "Keep each poll option between 1 and 30 characters." });
    expect(poll({ options: ["a", "x".repeat(31)] })).toEqual({ error: "Keep each poll option between 1 and 30 characters." });
    expect(poll({ days: 5 })).toEqual({ error: "Run the poll for 1 day, 3 days, 1 week or 2 weeks." });
    // no poll: no linkedin key, so the input is today's
    expect((sched({ mediaUrls: [], linkedin: {} }) as { value: ScheduleInput }).value).not.toHaveProperty("linkedin");
  });

  it("refuses, in plain words, what the picked networks can't take", () => {
    const reel = input({ instagram: { placement: "reel" } });
    expect(platformProblem(reel, ["instagram"])).toBe("An Instagram Reel takes one video.");
    expect(platformProblem(input({ mediaUrls: [MP4], instagram: { placement: "reel" } }), ["instagram"])).toBeNull();
    // only the networks picked: the same input to LinkedIn alone goes
    expect(platformProblem(reel, ["linkedin"])).toBeNull();
    expect(platformProblem(input({ facebook: { placement: "reel" } }), ["facebook"])).toBe("A Facebook Reel takes one vertical video.");
    expect(platformProblem(input({ mediaUrls: [], facebook: { placement: "reel" } }), ["facebook"])).toBe("A Facebook Reel takes one vertical video.");
    expect(platformProblem(input({ mediaUrls: [MP4], facebook: { placement: "reel" } }), ["facebook"])).toBeNull();
    expect(platformProblem(input({ mediaUrls: [], facebook: { placement: "story" } }), ["facebook"])).toBe("A Facebook Story needs a picture or video.");
    const pollIn = { poll: { question: "Which?", options: ["a", "b"], days: 7 as const } };
    expect(platformProblem(input({ linkedin: pollIn }), ["linkedin"])).toBe("A LinkedIn poll can't carry pictures or a video.");
    expect(platformProblem(input({ mediaUrls: [], linkedin: pollIn }), ["linkedin"])).toBeNull();
    const story = "Stories post no first comment. Take it off, or post to the feed.";
    expect(platformProblem(input({ firstComment: "Link: https://x.sg", instagram: { placement: "story" } }), ["instagram"])).toBe(story);
    expect(platformProblem(input({ firstComment: "Link: https://x.sg", facebook: { placement: "story" } }), ["facebook", "linkedin"])).toBe(story);
    expect(platformProblem(input({ firstComment: "Link: https://x.sg", instagram: { placement: "feed" } }), ["instagram"])).toBeNull();
  });

  it("maps them to platformSpecificData on that network's entry", () => {
    expect(data(input({ mediaUrls: [MP4], instagram: { placement: "reel", shareToFeed: false, trial: true, collaborators: ["moneybees"], commentsOff: true } }), "instagram")).toEqual({
      shareToFeed: false,
      trialParams: { graduationStrategy: "MANUAL" },
      collaborators: ["moneybees"],
      commentsEnabled: false,
    });
    // a Story takes none of the feed's options; a feed post takes no Reel ones
    expect(data(input({ instagram: { placement: "story", collaborators: ["moneybees"], commentsOff: true } }), "instagram")).toEqual({ contentType: "story" });
    expect(data(input({ instagram: { placement: "feed", shareToFeed: false, trial: true, collaborators: ["moneybees"] } }), "instagram")).toEqual({ collaborators: ["moneybees"] });
    expect(data(input({ instagram: { placement: "feed" } }), "instagram")).toBeUndefined();
    expect(data(input({ mediaUrls: [MP4], facebook: { placement: "reel" } }), "facebook", FB)).toEqual({ contentType: "reel" });
    expect(data(input({ facebook: { placement: "story" } }), "facebook", FB)).toEqual({ contentType: "story" });
    expect(data(input({ facebook: { placement: "feed" } }), "facebook", FB)).toBeUndefined();
    for (const [days, duration] of [[1, "ONE_DAY"], [3, "THREE_DAYS"], [7, "SEVEN_DAYS"], [14, "FOURTEEN_DAYS"]] as const) {
      expect(data(input({ mediaUrls: [], linkedin: { poll: { question: "Which?", options: ["a", "b"], days } } }), "linkedin", LI)).toEqual({ poll: { question: "Which?", options: ["a", "b"], duration } });
    }
    // each network's options stay on its own entry
    const mixed = postBody(input({ mediaUrls: [MP4], instagram: { placement: "story" }, facebook: { placement: "reel" } }), [{ _id: LI, platform: "linkedin" }, { _id: IG, platform: "instagram" }]);
    expect((mixed.platforms as { platformSpecificData?: unknown }[]).map((p) => p.platformSpecificData)).toEqual([undefined, { contentType: "story" }]);
  });

  it("drops all of them for a caller off NORTH_STAR_USERS, a malformed one too, before any check", () => {
    const body = { action: "schedule", profileId: "me", accountIds: [IG], clientKey: KEY, content: "hi", scheduledFor: LATER, mediaUrls: [PNG], instagram: { placement: "nope" }, facebook: { placement: "story" }, linkedin: { poll: { question: "" } } };
    const off = parsePostRequest(body, NOW, false) as { ok: true; req: { input: ScheduleInput } };
    expect(off.ok).toBe(true);
    expect(off.req.input).toEqual(input({ content: "hi" }));
    expect(parsePostRequest(body, NOW, true)).toEqual({ ok: false, status: 400, error: "Pick Feed, Reel or Story for Instagram." });
  });
});

// The ladder's rung 1: Zernio's own checks, nothing saved. Fixtures copy
// https://docs.zernio.com/posts/create-post.mdx (dryRun: TikTok only, 200 { dryRun: true, canPublish, tiktok: [one verdict
// per entry] }; the verdict's fields beyond "a per-account go/no-go and a reason" are not documented, so accountId,
// canPublish and reason are assumed), https://docs.zernio.com/validate/validate-post.mdx ({ valid, errors: [{ platform,
// error }], warnings }), https://docs.zernio.com/validate/validate-media.mdx ({ valid, error, sizeFormatted, platformLimits })
// and https://docs.zernio.com/api-keys/create-api-key.mdx (a restricted key's 403 code=insufficient_permissions).
describe("check (Leo only): Zernio's own checks, nothing saved", () => {
  const TWO = "https://media.zernio.com/temp/1_a_slide-02.png";
  const tiktok = { privacyLevel: "PUBLIC_TO_EVERYONE", allowComment: true, allowDuet: false, allowStitch: false };
  const check = (accountIds: string[], i: ScheduleInput = input({ tiktok })): PostRequest => ({ action: "schedule", profileId: "me", accountIds, input: i, check: true } as PostRequest);
  const go = { dryRun: true, canPublish: true, tiktok: [{ accountId: TT, canPublish: true }] };
  const valid = { valid: true, message: "No validation issues found.", warnings: [] };
  const file = (url: string, withinLimit = true) => ({ valid: true, url, contentType: "image/png", size: 245000, sizeFormatted: "245 KB", type: "image", platformLimits: { instagram: { limit: 8388608, limitFormatted: "8.0 MB", withinLimit } } });
  const listed = () => vi.stubGlobal("Deno", { env: { get: (k: string) => (k === "NORTH_STAR_USERS" ? UID : undefined) } });
  afterEach(() => vi.unstubAllGlobals());
  const saved = (keys: string[]) => keys.filter((k) => k.startsWith("PUT ") || k.startsWith("DELETE ") || k.includes("/retry"));

  it("sends TikTok as a dryRun create with no Idempotency-Key, and nothing else", async () => {
    listed();
    const f = fake({ "GET /accounts": accounts, "POST /posts": go });
    expect(await runPost(f.z, MINE, UID, check([TT], input({ tiktok: { ...tiktok, mode: "inbox" } })), NOW)).toEqual({ status: 200, body: { check: { ok: true, problems: [] } } });
    expect(f.keys()).toEqual(["GET /accounts", "POST /posts"]);
    const req = f.req("POST /posts")!;
    expect(req.idempotencyKey).toBeUndefined();
    expect(req.body).toMatchObject({ dryRun: true, platforms: [{ platform: "tiktok", accountId: TT, platformSpecificData: { tiktokSettings: { draft: true } } }] });
  });

  it("names TikTok's no-go and a body it refuses as problems, not errors", async () => {
    listed();
    const busy = { dryRun: true, canPublish: false, tiktok: [{ accountId: TT, canPublish: false, reason: "TikTok direct posting is at capacity right now." }] };
    const f = fake({ "GET /accounts": accounts, "POST /posts": busy });
    expect(await runPost(f.z, MINE, UID, check([TT]), NOW)).toEqual({ status: 200, body: { check: { ok: false, problems: ["TikTok: TikTok direct posting is at capacity right now."] } } });
    const quiet = fake({ "GET /accounts": accounts, "POST /posts": { dryRun: true, canPublish: false, tiktok: [{ accountId: TT, canPublish: false }] } });
    expect((await runPost(quiet.z, MINE, UID, check([TT]), NOW)).body).toEqual({ check: { ok: false, problems: ["TikTok: it can't take a direct post on this account right now."] } });
    const refused = fake({ "GET /accounts": accounts, "POST /posts": new ZernioError(400, "invalid_field_value", "Selected privacy level 'X' is not available for this creator.") });
    expect((await runPost(refused.z, MINE, UID, check([TT]), NOW)).body).toEqual({ check: { ok: false, problems: ["TikTok: Selected privacy level 'X' is not available for this creator."] } });
  });

  it("sends Instagram, Facebook and LinkedIn to validate post, each file to validate media, and TikTok to its dry run alone", async () => {
    listed();
    const f = fake({ "GET /accounts": accounts, "POST /posts": go, "POST /tools/validate/post": valid, "POST /tools/validate/media": (r?: ZernioRequest) => file((r!.body as { url: string }).url) });
    const both = input({ tiktok, mediaUrls: [PNG, TWO] });
    expect(await runPost(f.z, MINE, UID, check([TT, IG], both), NOW)).toEqual({ status: 200, body: { check: { ok: true, problems: [] } } });
    expect(f.keys()).toEqual(["GET /accounts", "POST /posts", "POST /tools/validate/post", "POST /tools/validate/media", "POST /tools/validate/media"]);
    expect((f.req("POST /posts")!.body as { platforms: { platform: string }[] }).platforms.map((p) => p.platform)).toEqual(["tiktok"]);
    const sentToValidate = f.req("POST /tools/validate/post")!;
    expect(sentToValidate.body).not.toHaveProperty("dryRun");
    expect((sentToValidate.body as { platforms: { platform: string }[] }).platforms.map((p) => p.platform)).toEqual(["instagram"]);
    expect(f.calls.filter((c) => c.key === "POST /tools/validate/media").map((c) => c.req!.body)).toEqual([{ url: PNG }, { url: TWO }]);
    expect(saved(f.keys())).toEqual([]);
  });

  it("lists what validate finds, and a file over a network's limit", async () => {
    listed();
    const f = fake({
      "GET /accounts": accounts,
      "POST /tools/validate/post": { valid: false, errors: [{ platform: "instagram", error: "Instagram allows at most 5 hashtags." }], warnings: [{ platform: "instagram", warning: "Near the limit." }] },
      "POST /tools/validate/media": (r?: ZernioRequest) => ((r!.body as { url: string }).url === TWO ? file(TWO, false) : { valid: false, url: PNG, error: "URL returned 404" }),
    });
    expect((await runPost(f.z, MINE, UID, check([IG], input({ mediaUrls: [PNG, TWO] })), NOW)).body).toEqual({
      check: { ok: false, problems: ["Instagram: Instagram allows at most 5 hashtags.", "A file: URL returned 404", "Instagram: a file is 245 KB, over its 8.0 MB."] },
    });
  });

  it("answers check_unavailable when the key's group refuses validate, and checks nothing it can't take", async () => {
    listed();
    const denied = new ZernioError(403, "insufficient_permissions", "This API key has the 'publishing' resource group disabled. POST /api/v1/tools/validate/post requires it.");
    for (const route of ["POST /tools/validate/post", "POST /tools/validate/media"]) {
      const f = fake({ "GET /accounts": accounts, "POST /tools/validate/post": valid, "POST /tools/validate/media": file(PNG), [route]: denied });
      expect(await runPost(f.z, MINE, UID, check([IG], input()), NOW), route).toEqual({ status: 403, body: { code: "check_unavailable", error: "Zernio's check isn't open to this app's key." } });
    }
    const empty = fake({ "GET /accounts": accounts });
    expect(await runPost(empty.z, MINE, UID, check([IG], input({ mediaUrls: [] })), NOW)).toEqual({ status: 400, body: { error: "Instagram needs a picture or video." } });
    expect(empty.keys()).toEqual(["GET /accounts"]);
  });

  it("cancels at once a real post Zernio makes when it ignores dryRun", async () => {
    listed();
    const f = fake({ "GET /accounts": accounts, "POST /posts": zPost(POST, [TT]), [`DELETE /posts/${POST}`]: { message: "Deleted" } });
    expect(await runPost(f.z, MINE, UID, check([TT]), NOW)).toEqual({ status: 502, body: { code: "not_a_check", error: "Zernio didn't run it as a check. Any post it made was cancelled." } });
    expect(f.keys()).toEqual(["GET /accounts", "POST /posts", `DELETE /posts/${POST}`]);
  });

  it("is Leo's: refused off NORTH_STAR_USERS before Zernio hears of it", async () => {
    expect(northStarOnly(check([TT]))).toBe(true);
    const f = fake({});
    expect(await runPost(f.z, MINE, UID, check([TT]), NOW)).toEqual({ status: 403, body: { code: "not_enabled", error: "This isn't switched on for your account yet." } });
    expect(f.keys()).toEqual([]);
    // parsed for anyone, so the gate can refuse it rather than post it
    expect(parsePostRequest({ action: "schedule", profileId: "me", accountIds: [TT], clientKey: KEY, content: "hi", scheduledFor: LATER, check: true }, NOW, false)).toMatchObject({ ok: true, req: { check: true } });
    expect(parsePostRequest({ action: "schedule", profileId: "me", accountIds: [TT], clientKey: KEY, content: "hi", scheduledFor: LATER, check: "yes" }, NOW, true)).not.toHaveProperty("req.check");
  });
});

describe("schedule", () => {
  it("posts from the caller's own accounts with the H4 key, and returns the checked post", async () => {
    const f = fake({ "GET /accounts": accounts, "POST /posts": zPost(POST, [IG, LI]) });
    const reply = await runPost(f.z, MINE, UID, schedule([IG, LI]), NOW);
    expect(reply).toMatchObject({ status: 200, body: { post: { id: POST, status: "scheduled", platforms: [{ platform: "instagram", accountId: IG, status: "pending", url: null }, { accountId: LI }] } } });
    const req = f.req("POST /posts")!;
    expect(req.idempotencyKey).toBe(`cs:${UID}:me:${KEY}`);
    expect((req.body as { platforms: { accountId: string }[] }).platforms.map((p) => p.accountId)).toEqual([IG, LI]);
    expect(f.req("GET /accounts")!.query).toEqual({ profileId: MINE, includeOverLimit: "true" });
  });

  it("never sends another adviser's account to Zernio", async () => {
    const f = fake({ "GET /accounts": accounts });
    await expect(runPost(f.z, MINE, UID, schedule([IG, VICTIM]), NOW)).rejects.toBeInstanceOf(NotYours);
    expect(f.keys()).toEqual(["GET /accounts"]);
  });

  it("refuses what the platform can't take before calling Zernio", async () => {
    const f = fake({ "GET /accounts": accounts });
    expect(await runPost(f.z, MINE, UID, schedule([IG], input({ mediaUrls: [] })), NOW)).toEqual({ status: 400, body: { error: "Instagram needs a picture or video." } });
    expect(f.keys()).toEqual(["GET /accounts"]);
  });

  it("a client uuid reused by another adviser never returns the first adviser's post", async () => {
    // Zernio matches Idempotency-Key on the key alone across the whole team
    const byKey = new Map<string, unknown>();
    let n = 0;
    const team = (profileId: string) => (req?: ZernioRequest) => {
      if (!byKey.has(req!.idempotencyKey!)) {
        const ids = (req!.body as { platforms: { accountId: string }[] }).platforms.map((p) => p.accountId);
        byKey.set(req!.idempotencyKey!, zPost(`67000000000000000000e00${++n}`, ids));
      }
      return byKey.get(req!.idempotencyKey!);
    };
    const mine = fake({ "GET /accounts": accounts, "POST /posts": team(MINE) });
    const first = await runPost(mine.z, MINE, UID, schedule([IG]), NOW);
    const theirs = fake({ "GET /accounts": accounts, "POST /posts": team(THEIRS) });
    const second = await runPost(theirs.z, THEIRS, OTHER_UID, schedule([VICTIM]), NOW);
    expect((first.body.post as { id: string }).id).not.toBe((second.body.post as { id: string }).id);
    expect(theirs.req("POST /posts")!.idempotencyKey).toBe(`cs:${OTHER_UID}:me:${KEY}`);
    // and were Zernio to hand back the first adviser's post anyway, the post check refuses it
    const leaky = fake({ "GET /accounts": accounts, "POST /posts": zPost(POST, [IG]) });
    await expect(runPost(leaky.z, THEIRS, OTHER_UID, schedule([VICTIM]), NOW)).rejects.toBeInstanceOf(NotYours);
  });

  it("refuses a returned post with no platforms or a malformed id", async () => {
    for (const answer of [zPost(POST, []), { post: { ...zPost(POST, [IG]).post, _id: "x" } }, { message: "ok" }]) {
      const f = fake({ "GET /accounts": accounts, "POST /posts": answer });
      await expect(runPost(f.z, MINE, UID, schedule([IG]), NOW), JSON.stringify(answer)).rejects.toBeInstanceOf(NotYours);
    }
  });

  it("refuses before the brand's first connect", async () => {
    const f = fake({});
    await expect(runPost(f.z, null, UID, schedule([IG]), NOW)).rejects.toBeInstanceOf(NotYours);
    expect(f.keys()).toEqual([]);
  });
});

describe("post, cancel and retry", () => {
  const act = (action: "post" | "cancel" | "retry", postId = POST): PostRequest => ({ action, profileId: "me", postId });

  it("reads each platform's status, link and reason", async () => {
    const published = zPost(POST, [IG, LI], {
      status: "partial",
      platforms: [
        { platform: "instagram", accountId: { _id: IG }, status: "published", platformPostUrl: "https://www.instagram.com/p/abc/" },
        { platform: "linkedin", accountId: LI, status: "failed", errorMessage: "Token expired", platformPostUrl: "javascript:x" },
      ],
    });
    const f = fake({ "GET /accounts": accounts, [`GET /posts/${POST}`]: published });
    expect((await runPost(f.z, MINE, UID, act("post"))).body.post).toEqual({
      id: POST,
      status: "partial",
      scheduledFor: "2026-10-12T01:00:00.000Z",
      platforms: [
        { platform: "instagram", accountId: IG, status: "published", url: "https://www.instagram.com/p/abc/", error: "", draft: false },
        { platform: "linkedin", accountId: LI, status: "failed", url: null, error: "Token expired", draft: false },
      ],
    });
  });

  it("never reads, cancels or retries another adviser's post (H2)", async () => {
    for (const action of ["post", "cancel", "retry"] as const) {
      const f = fake({ "GET /accounts": accounts, [`GET /posts/${THEIR_POST}`]: zPost(THEIR_POST, [IG, VICTIM], { status: "failed" }) });
      await expect(runPost(f.z, MINE, UID, act(action, THEIR_POST)), action).rejects.toBeInstanceOf(NotYours);
      expect(f.keys()).toEqual(["GET /accounts", `GET /posts/${THEIR_POST}`]);
    }
  });

  it("cancels a scheduled post and refuses a published one plainly", async () => {
    const f = fake({ "GET /accounts": accounts, [`GET /posts/${POST}`]: zPost(POST, [IG]), [`DELETE /posts/${POST}`]: { message: "Deleted" } });
    expect(await runPost(f.z, MINE, UID, act("cancel"))).toEqual({ status: 200, body: { cancelled: true } });
    expect(f.keys()).toContain(`DELETE /posts/${POST}`);

    const live = zPost(POST, [IG, LI], { status: "partial", platforms: [{ platform: "instagram", accountId: IG, status: "published" }, { platform: "linkedin", accountId: LI, status: "failed" }] });
    const g = fake({ "GET /accounts": accounts, [`GET /posts/${POST}`]: live });
    expect(await runPost(g.z, MINE, UID, act("cancel"))).toEqual({ status: 409, body: { code: "published", error: "It's already posted on Instagram, so it can't be cancelled. Delete it there." } });
    expect(g.keys()).not.toContain(`DELETE /posts/${POST}`);
  });

  it("retries only a failed post and checks what comes back", async () => {
    const f = fake({ "GET /accounts": accounts, [`GET /posts/${POST}`]: zPost(POST, [IG], { status: "failed" }), [`POST /posts/${POST}/retry`]: zPost(POST, [IG], { status: "published" }) });
    expect(await runPost(f.z, MINE, UID, act("retry"))).toMatchObject({ status: 200, body: { post: { id: POST, status: "published" } } });

    const g = fake({ "GET /accounts": accounts, [`GET /posts/${POST}`]: zPost(POST, [IG]) });
    expect(await runPost(g.z, MINE, UID, act("retry"))).toMatchObject({ status: 409, body: { code: "not_failed" } });
    expect(g.keys()).not.toContain(`POST /posts/${POST}/retry`);

    const h = fake({ "GET /accounts": accounts, [`GET /posts/${POST}`]: zPost(POST, [IG], { status: "failed" }), [`POST /posts/${POST}/retry`]: zPost(THEIR_POST, [VICTIM]) });
    await expect(runPost(h.z, MINE, UID, act("retry"))).rejects.toBeInstanceOf(NotYours);
  });
});

// Fixtures copy https://docs.zernio.com/posts/update-post.mdx (read 2026-10-25): PUT /v1/posts/{postId} takes
// scheduledFor and timezone, answers 200 { message, post }; draft, scheduled, failed, partial and cancelled posts can be edited.
describe("move (publish-calendar)", () => {
  const NEXT = "2026-10-20T09:00:00+08:00";
  const move = (postId = POST, scheduledFor = NEXT): PostRequest => ({ action: "move", profileId: "me", postId, scheduledFor } as PostRequest);
  const updated = (extra: Record<string, unknown> = {}) => ({ message: "Post updated", post: { ...zPost(POST, [IG]).post, scheduledFor: "2026-10-20T01:00:00.000Z", ...extra } });

  it("checks the id (404) and the time (400) before any use", () => {
    expect(parsePostRequest({ action: "move", profileId: "me", postId: "x", scheduledFor: NEXT }, NOW)).toEqual({ ok: false, status: 404, error: "Not found." });
    expect(parsePostRequest({ action: "move", profileId: "me", postId: POST.toUpperCase(), scheduledFor: NEXT }, NOW)).toMatchObject({ status: 404 });
    expect(parsePostRequest({ action: "move", profileId: "me", postId: POST, scheduledFor: "2026-10-11T09:59:00+08:00" }, NOW)).toEqual({ ok: false, status: 400, error: "That time has passed. Pick a later time, or post now." });
    // a minute ahead is the floor, as for a new post
    expect(parsePostRequest({ action: "move", profileId: "me", postId: POST, scheduledFor: "2026-10-11T10:00:30+08:00" }, NOW)).toMatchObject({ status: 400 });
    for (const bad of ["2026-10-20T09:00:00", "tomorrow", undefined, 1760230000000]) {
      expect(parsePostRequest({ action: "move", profileId: "me", postId: POST, scheduledFor: bad }, NOW), String(bad)).toEqual({ ok: false, status: 400, error: "Pick the day and time again." });
    }
    expect(parsePostRequest({ action: "move", profileId: "me", postId: POST, scheduledFor: NEXT }, NOW)).toEqual({ ok: true, req: { action: "move", profileId: "me", postId: POST, scheduledFor: NEXT } });
  });

  it("sends PUT with scheduledFor and timezone only, and returns the post through the post check", async () => {
    const f = fake({ "GET /accounts": accounts, [`GET /posts/${POST}`]: zPost(POST, [IG]), [`PUT /posts/${POST}`]: updated() });
    expect(await runPost(f.z, MINE, UID, move(), NOW)).toEqual({
      status: 200,
      body: { post: { id: POST, status: "scheduled", scheduledFor: "2026-10-20T01:00:00.000Z", platforms: [{ platform: "instagram", accountId: IG, status: "pending", url: null, error: "", draft: false }] } },
    });
    expect(f.keys()).toEqual(["GET /accounts", `GET /posts/${POST}`, `PUT /posts/${POST}`]);
    expect(f.req(`PUT /posts/${POST}`)).toEqual({ body: { scheduledFor: NEXT, timezone: "Asia/Singapore" } });
    // a failed post can move too (Zernio edits it)
    const g = fake({ "GET /accounts": accounts, [`GET /posts/${POST}`]: zPost(POST, [IG], { status: "failed" }), [`PUT /posts/${POST}`]: updated() });
    expect((await runPost(g.z, MINE, UID, move(), NOW)).status).toBe(200);
    // open to every SOCIAL_CONNECT_USERS caller: not a north-star field (decision 3, Q12)
    expect(northStarOnly(move())).toBe(false);
  });

  it("refuses a post that is published or going out, wholly or in part, with 409 and no PUT", async () => {
    const one = (status: string) => [{ platform: "instagram", accountId: IG, status }, { platform: "linkedin", accountId: LI, status: "pending" }];
    for (const [label, post] of [
      ["published", zPost(POST, [IG], { status: "published" })],
      ["publishing", zPost(POST, [IG], { status: "publishing" })],
      ["partial", zPost(POST, [IG, LI], { status: "partial", platforms: one("published") })],
      ["an entry published", zPost(POST, [IG, LI], { platforms: one("published") })],
      ["an entry processing", zPost(POST, [IG, LI], { platforms: one("processing") })],
      ["an entry uploading", zPost(POST, [IG, LI], { platforms: one("uploading") })],
    ] as const) {
      const f = fake({ "GET /accounts": accounts, [`GET /posts/${POST}`]: post });
      expect(await runPost(f.z, MINE, UID, move(), NOW), label).toEqual({ status: 409, body: { code: "published", error: "It's already going out, so it can't move." } });
      expect(f.keys(), label).not.toContain(`PUT /posts/${POST}`);
    }
  });

  it("never reschedules a cancelled post, which Zernio would send again", async () => {
    const f = fake({ "GET /accounts": accounts, [`GET /posts/${POST}`]: zPost(POST, [IG], { status: "cancelled" }) });
    expect(await runPost(f.z, MINE, UID, move(), NOW)).toEqual({ status: 409, body: { code: "cancelled", error: "It was cancelled on Zernio, so it can't move." } });
    expect(f.keys()).not.toContain(`PUT /posts/${POST}`);
  });

  it("never moves another adviser's post (H2), or hands back one Zernio answers with (H4)", async () => {
    const f = fake({ "GET /accounts": accounts, [`GET /posts/${THEIR_POST}`]: zPost(THEIR_POST, [VICTIM]) });
    await expect(runPost(f.z, MINE, UID, move(THEIR_POST), NOW)).rejects.toBeInstanceOf(NotYours);
    expect(f.keys()).toEqual(["GET /accounts", `GET /posts/${THEIR_POST}`]);
    const gone = fake({ "GET /accounts": accounts, [`GET /posts/${POST}`]: new ZernioError(404, "", "Not found") });
    await expect(runPost(gone.z, MINE, UID, move(), NOW)).rejects.toBeInstanceOf(NotYours);
    const leaky = fake({ "GET /accounts": accounts, [`GET /posts/${POST}`]: zPost(POST, [IG]), [`PUT /posts/${POST}`]: { post: zPost(THEIR_POST, [VICTIM]).post } });
    await expect(runPost(leaky.z, MINE, UID, move(), NOW)).rejects.toBeInstanceOf(NotYours);
  });
});

describe("presign and TikTok creator info", () => {
  it("hands out Zernio's upload link only when both links are https", async () => {
    const req: PostRequest = { action: "presign", profileId: "me", file: { filename: "slide-01.png", contentType: "image/png", size: 1000 } };
    const f = fake({ "POST /media/presign": { uploadUrl: "https://storage.example/put?sig=1", publicUrl: PNG, key: "temp/x", expiresIn: 3600 } });
    expect(await runPost(f.z, MINE, UID, req)).toEqual({ status: 200, body: { uploadUrl: "https://storage.example/put?sig=1", publicUrl: PNG } });
    expect(f.req("POST /media/presign")!.body).toEqual({ filename: "slide-01.png", contentType: "image/png", size: 1000 });
    const g = fake({ "POST /media/presign": { uploadUrl: "http://storage.example/put", publicUrl: PNG } });
    await expect(runPost(g.z, MINE, UID, req)).rejects.toBeInstanceOf(ZernioError);
  });

  it("reads the creator's privacy levels for the caller's own TikTok account only", async () => {
    const info = {
      creator: { nickname: "me", canPostMore: true },
      privacyLevels: [{ value: "PUBLIC_TO_EVERYONE", label: "Public To Everyone" }, { value: "SELF_ONLY", label: "Self Only" }, { value: "<b>", label: "x" }],
      postingLimits: { maxVideoDurationSec: 600, interactionSettings: { allow_comment: { enabled: true }, allow_duet: { enabled: true }, allow_stitch: { enabled: false } } },
    };
    const f = fake({ "GET /accounts": accounts, [`GET /accounts/${TT}/tiktok/creator-info`]: info });
    const req: PostRequest = { action: "tiktok-creator-info", profileId: "me", accountId: TT, mediaType: "video" };
    expect((await runPost(f.z, MINE, UID, req)).body.info).toEqual({
      privacyLevels: [{ value: "PUBLIC_TO_EVERYONE", label: "Public To Everyone" }, { value: "SELF_ONLY", label: "Self Only" }],
      comment: true,
      duet: true,
      stitch: false,
      canPostMore: true,
      maxVideoSeconds: 600,
    });
    expect(f.req(`GET /accounts/${TT}/tiktok/creator-info`)!.query).toEqual({ mediaType: "video" });
    for (const accountId of [IG, VICTIM]) {
      const g = fake({ "GET /accounts": accounts });
      await expect(runPost(g.z, MINE, UID, { ...req, accountId } as PostRequest)).rejects.toBeInstanceOf(NotYours);
      expect(g.keys()).toEqual(["GET /accounts"]);
    }
  });
});

describe("Zernio's refusals in plain words", () => {
  it("names the fix", () => {
    expect(postErrorReply(new ZernioError(409, "idempotency_conflict", "x"))).toMatchObject({ status: 409, body: { code: "in_flight" } });
    expect(postErrorReply(new ZernioError(409, "", "This exact content..."))).toMatchObject({ status: 409, body: { code: "duplicate" } });
    expect(postErrorReply(new ZernioError(403, "ACCOUNT_DISCONNECTED", "Account x is disconnected"))).toMatchObject({ status: 409, body: { code: "reconnect" } });
    expect(postErrorReply(new ZernioError(400, "", "Selected privacy level 'X' is not available for this creator."))).toMatchObject({
      status: 400,
      body: { error: "Zernio didn't take it: Selected privacy level 'X' is not available for this creator." },
    });
    expect(postErrorReply(new ZernioError(400, "", "Zernio answered 400."))).toMatchObject({ body: { error: "Zernio didn't take it. Check the post and try again." } });
    // a 403 with no code is a key or scope problem: left to the shared reply, never Zernio's words
    expect(postErrorReply(new ZernioError(403, "", "Account belongs to someone else"))).toBeNull();
    expect(postErrorReply(new Error("x"))).toBeNull();
  });
});

describe("a thread on Threads (Leo only)", () => {
  const TH = "65000000000000000000a005";
  const withThreads = (req?: ZernioRequest) => ({ accounts: [...TEAM, acct(TH, "threads")].filter((a) => a.profileId === req?.query?.profileId) });
  const posts = ["Most people pay for their hospital stay twice.", "First through the premium.", "Then through the co-pay. Check yours."];
  const body = (extra: Record<string, unknown> = {}) => ({ clientKey: KEY, content: "ignored", scheduledFor: LATER, thread: posts, ...extra });
  const listed = (uids: string) => vi.stubGlobal("Deno", { env: { get: (k: string) => (k === "NORTH_STAR_USERS" ? uids : undefined) } });
  afterEach(() => vi.unstubAllGlobals());

  it("takes 2 to 10 posts, each up to Threads' 500, and shows its first post as the content", () => {
    const ok = checkSchedule(body({ thread: [` ${posts[0]} `, ...posts.slice(1)] }), NOW);
    expect(ok).toMatchObject({ value: { content: posts[0], thread: posts } });
    expect(checkSchedule(body({ thread: [posts[0]] }), NOW)).toEqual({ error: "A thread has 2 to 10 posts." });
    expect(checkSchedule(body({ thread: Array(11).fill("Post.") }), NOW)).toEqual({ error: "A thread has 2 to 10 posts." });
    expect(checkSchedule(body({ thread: [posts[0], "  "] }), NOW)).toEqual({ error: "Fill in every post in the thread, or take the empty one out." });
    expect(checkSchedule(body({ thread: [posts[0], "x".repeat(501)] }), NOW)).toEqual({ error: "Keep each post in the thread under 501 characters." });
    expect(checkSchedule(body({ thread: "one post" }), NOW)).toEqual({ error: "A thread has 2 to 10 posts." });
    // no thread: the draft as before, with no thread key at all
    expect(checkSchedule(body({ thread: undefined }), NOW)).toEqual({ value: { ...input({ content: "ignored", mediaUrls: [] }) } });
  });

  it("goes to Threads on its own: beside LinkedIn or Instagram it is refused", () => {
    const t = input({ thread: posts, content: posts[0] });
    expect(platformProblem(t, ["threads"])).toBeNull();
    expect(platformProblem(t, ["threads", "linkedin"])).toBe(THREAD_MIXED);
    expect(platformProblem(t, ["instagram"])).toBe(THREAD_MIXED);
    expect(THREAD_MIXED).toBe("Send the thread to Threads on its own, then the post to the others.");
  });

  it("builds threadItems in order on the Threads entry, the media on the first post only", () => {
    const b = postBody(input({ thread: posts, content: posts[0], mediaUrls: [PNG, "https://media.zernio.com/temp/2.png"], firstComment: "More: https://x.sg" }), [{ _id: TH, platform: "threads" }]);
    expect(b.content).toBe(posts[0]);
    expect(b.platforms).toEqual([
      {
        platform: "threads",
        accountId: TH,
        customContent: posts[0],
        platformSpecificData: {
          threadItems: [{ content: posts[0], mediaItems: [{ url: PNG }, { url: "https://media.zernio.com/temp/2.png" }] }, { content: posts[1] }, { content: posts[2] }],
          firstComment: "More: https://x.sg",
        },
      },
    ]);
    const plain = postBody(input({ thread: posts, content: posts[0], mediaUrls: [] }), [{ _id: TH, platform: "threads" }]);
    expect((plain.platforms as { platformSpecificData: { threadItems: unknown[] } }[])[0].platformSpecificData.threadItems).toEqual(posts.map((content) => ({ content })));
  });

  it("is refused for an account not on NORTH_STAR_USERS before Zernio hears of it", async () => {
    listed("13b28b1d-2ecb-40be-b3a9-aefc90366f9b");
    const f = fake({});
    const reply = await runPost(f.z, MINE, UID, schedule([TH], input({ thread: posts, content: posts[0], mediaUrls: [] })), NOW);
    expect(reply).toEqual({ status: 403, body: { code: "not_enabled", error: "This isn't switched on for your account yet." } });
    expect(f.keys()).toEqual([]);
    vi.unstubAllGlobals();
    expect((await runPost(f.z, MINE, UID, schedule([TH], input({ thread: posts, content: posts[0], mediaUrls: [] })), NOW)).status).toBe(403);
  });

  it("sends the thread for a listed account, and refuses it beside LinkedIn before posting", async () => {
    listed(`x, ${UID}`);
    const f = fake({ "GET /accounts": withThreads, "POST /posts": zPost(POST, [TH]) });
    const reply = await runPost(f.z, MINE, UID, schedule([TH], input({ thread: posts, content: posts[0], mediaUrls: [] })), NOW);
    expect(reply.status).toBe(200);
    const sent = f.req("POST /posts")!.body as { platforms: { platformSpecificData: { threadItems: { content: string }[] } }[] };
    expect(sent.platforms[0].platformSpecificData.threadItems.map((t) => t.content)).toEqual(posts);
    const mixed = fake({ "GET /accounts": withThreads });
    expect(await runPost(mixed.z, MINE, UID, schedule([TH, LI], input({ thread: posts, content: posts[0], mediaUrls: [] })), NOW)).toEqual({ status: 400, body: { error: THREAD_MIXED } });
    expect(mixed.keys()).toEqual(["GET /accounts"]);
  });

  it("leaves a post with no thread alone for everyone", async () => {
    const f = fake({ "GET /accounts": accounts, "POST /posts": zPost(POST, [LI]) });
    expect((await runPost(f.z, MINE, OTHER_UID, schedule([LI], input({ mediaUrls: [] })), NOW)).status).toBe(200);
    expect(JSON.stringify(f.req("POST /posts")!.body)).not.toContain("threadItems");
  });
});

describe("a carousel PDF as a LinkedIn document (Leo only)", () => {
  const PDF = "https://media.zernio.com/temp/1_a_carousel-1.pdf";
  const title = "3 things to check on your hospital plan";
  const pdfPost = (extra: Partial<ScheduleInput> = {}) => input({ mediaUrls: [PDF], documentTitle: title, ...extra });
  const listed = (uids: string) => vi.stubGlobal("Deno", { env: { get: (k: string) => (k === "NORTH_STAR_USERS" ? uids : undefined) } });
  afterEach(() => vi.unstubAllGlobals());

  it("takes one PDF with its title, on its own", () => {
    const sched = (extra: Record<string, unknown>) => checkSchedule({ clientKey: KEY, content: "hi", scheduledFor: LATER, mediaUrls: [PDF], ...extra }, NOW);
    expect(sched({ documentTitle: ` ${title} ` })).toMatchObject({ value: { mediaUrls: [PDF], documentTitle: title } });
    expect(sched({ mediaUrls: [PDF, PNG], documentTitle: title })).toEqual({ error: "Post the PDF on its own." });
    expect(sched({ mediaUrls: [PDF, PDF], documentTitle: title })).toEqual({ error: "Post the PDF on its own." });
    expect(sched({})).toEqual({ error: "Give the PDF a title." });
    expect(sched({ documentTitle: "x".repeat(201) })).toEqual({ error: "Keep the PDF's title under 201 characters." });
    expect(sched({ mediaUrls: ["http://media.zernio.com/a.pdf"], documentTitle: title })).toEqual({ error: "Attach the media again." });
    // with no PDF the title is dropped, so a picture post's fields are exactly as before
    expect(checkSchedule({ clientKey: KEY, content: "hi", scheduledFor: LATER, mediaUrls: [PNG], documentTitle: title }, NOW)).toEqual({ value: input({ content: "hi" }) });
    expect(isPdf(PDF)).toBe(true);
    expect(isPdf("https://x.sg/a.pdf.png")).toBe(false);
  });

  it("goes to LinkedIn alone, and is refused for Instagram or beside it", () => {
    expect(platformProblem(pdfPost(), ["linkedin"])).toBeNull();
    expect(platformProblem(pdfPost(), ["instagram"])).toBe(PDF_LINKEDIN_ONLY);
    expect(platformProblem(pdfPost(), ["linkedin", "facebook"])).toBe(PDF_LINKEDIN_ONLY);
    expect(PDF_LINKEDIN_ONLY).toBe("Only LinkedIn takes a PDF. Post the pictures for Instagram.");
  });

  it("is sent as a document with its title, and documentTitle on the LinkedIn entry only", () => {
    const b = postBody(pdfPost({ firstComment: "More: https://x.sg" }), [{ _id: LI, platform: "linkedin" }]);
    expect(b.mediaItems).toEqual([{ url: PDF, type: "document", title }]);
    expect(b.platforms).toEqual([{ platform: "linkedin", accountId: LI, customContent: "Three things to check before you renew.", platformSpecificData: { documentTitle: title, firstComment: "More: https://x.sg" } }]);
    // a picture post to LinkedIn is today's body
    const pics = postBody(input(), [{ _id: LI, platform: "linkedin" }]);
    expect(pics.mediaItems).toEqual([{ url: PNG }]);
    expect(pics.platforms).toEqual([{ platform: "linkedin", accountId: LI, customContent: "Three things to check before you renew." }]);
  });

  it("names a PDF's upload and post as Leo's, and nothing else", () => {
    const presign = (contentType: string): PostRequest => ({ action: "presign", profileId: "me", file: { filename: "a.pdf", contentType, size: 10 } });
    expect(northStarOnly(presign("application/pdf"))).toBe(true);
    expect(northStarOnly(presign("image/png"))).toBe(false);
    expect(northStarOnly(schedule([LI], pdfPost()))).toBe(true);
    expect(northStarOnly(schedule([LI], input({ thread: ["a", "b"] })))).toBe(true);
    expect(northStarOnly(schedule([LI, IG]))).toBe(false);
    expect(northStarOnly({ action: "cancel", profileId: "me", postId: POST })).toBe(false);
  });

  it("is refused for an account not on NORTH_STAR_USERS before Zernio hears of it, the upload too", async () => {
    listed("13b28b1d-2ecb-40be-b3a9-aefc90366f9b");
    const f = fake({});
    const off = { status: 403, body: { code: "not_enabled", error: "This isn't switched on for your account yet." } };
    expect(await runPost(f.z, MINE, UID, schedule([LI], pdfPost()), NOW)).toEqual(off);
    expect(await runPost(f.z, MINE, UID, { action: "presign", profileId: "me", file: { filename: "carousel-1.pdf", contentType: "application/pdf", size: 1000 } })).toEqual(off);
    expect(f.keys()).toEqual([]);
  });

  it("uploads and schedules the document for a listed account, and refuses it for Instagram before posting", async () => {
    listed(`x, ${UID}`);
    const up = fake({ "POST /media/presign": { uploadUrl: "https://storage.example/put?sig=1", publicUrl: PDF } });
    expect(await runPost(up.z, MINE, UID, { action: "presign", profileId: "me", file: { filename: "carousel-1.pdf", contentType: "application/pdf", size: 1000 } })).toEqual({ status: 200, body: { uploadUrl: "https://storage.example/put?sig=1", publicUrl: PDF } });
    const f = fake({ "GET /accounts": accounts, "POST /posts": zPost(POST, [LI]) });
    expect((await runPost(f.z, MINE, UID, schedule([LI], pdfPost()), NOW)).status).toBe(200);
    const sent = f.req("POST /posts")!.body as { mediaItems: unknown[]; platforms: { platformSpecificData: Record<string, unknown> }[] };
    expect(sent.mediaItems).toEqual([{ url: PDF, type: "document", title }]);
    expect(sent.platforms[0].platformSpecificData).toEqual({ documentTitle: title });
    const ig = fake({ "GET /accounts": accounts });
    expect(await runPost(ig.z, MINE, UID, schedule([IG], pdfPost()), NOW)).toEqual({ status: 400, body: { error: PDF_LINKEDIN_ONLY } });
    expect(ig.keys()).toEqual(["GET /accounts"]);
  });

  it("leaves a picture post alone for everyone", async () => {
    const f = fake({ "GET /accounts": accounts, "POST /posts": zPost(POST, [IG, LI]) });
    expect((await runPost(f.z, MINE, OTHER_UID, schedule([IG, LI]), NOW)).status).toBe(200);
    expect(JSON.stringify(f.req("POST /posts")!.body)).not.toMatch(/document/);
  });
});
