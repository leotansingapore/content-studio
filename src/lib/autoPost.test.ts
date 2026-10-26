import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));

const { PDF_LINKEDIN_ONLY, THREAD_MIXED, TIKTOK_BUSY, TIKTOK_UPDATE, canCancel, canRetry, chipOf, fileProblem, fileType, isDue, linkFromView, platformProblem, postText, postedNow, renderEach, schedulePost, stepProblem, stepToOpen, tiktokReason, uploadAll, uploadName, UploadError, zernioTime } = await import("./autoPost");

/** A fake XMLHttpRequest: answers each PUT with the next status (0 = blocked, as a CORS refusal looks). */
let answers: number[] = [];
const puts: { url: string; type: string; size: number }[] = [];
class FakeXhr {
  status = 0;
  url = "";
  headers: Record<string, string> = {};
  upload: { onprogress?: (e: { loaded: number }) => void } = {};
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  open(_m: string, url: string) { this.url = url; }
  setRequestHeader(k: string, v: string) { this.headers[k] = v; }
  send(body: Blob) {
    puts.push({ url: this.url, type: this.headers["Content-Type"], size: body.size });
    this.upload.onprogress?.({ loaded: body.size / 2 });
    this.status = answers.shift() ?? 200;
    queueMicrotask(() => (this.status ? this.onload?.() : this.onerror?.()));
  }
}

beforeEach(() => {
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  callFn.mockReset();
  callFn.mockImplementation(async (_fn: string, body: { filename: string }) => ({
    uploadUrl: `https://storage.example/put/${body.filename}?sig=1`,
    publicUrl: `https://media.zernio.com/temp/${body.filename}`,
  }));
  answers = [];
  puts.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

const blob = (size: number) => new Blob([new Uint8Array(size)]);

describe("the files", () => {
  it("reads the type from the file, or its name when the browser gives none", () => {
    expect(fileType({ name: "a.png", type: "image/png" })).toBe("image/png");
    expect(fileType({ name: "Reel FINAL.MOV", type: "" })).toBe("video/quicktime");
    expect(fileType({ name: "a.heic", type: "image/heic" })).toBeNull();
    expect(fileProblem({ name: "a.gif", type: "image/gif", size: 10 })).toMatch(/isn't a JPG/);
    expect(fileProblem({ name: "big.jpg", type: "image/jpeg", size: 8_000_001 })).toBe("big.jpg is over 8 MB.");
    expect(fileProblem({ name: "long.mp4", type: "video/mp4", size: 300_000_001 })).toBe("long.mp4 is over 300 MB.");
    expect(fileProblem({ name: "ok.mp4", type: "video/mp4", size: 300_000_000 })).toBeNull();
  });

  it("takes a PDF only when asked for one (a carousel's LinkedIn document), up to 20 MB", () => {
    // a picked PDF is refused as before
    expect(fileType({ name: "deck.pdf", type: "application/pdf" })).toBeNull();
    expect(fileType({ name: "deck.pdf", type: "" })).toBeNull();
    expect(fileProblem({ name: "deck.pdf", type: "application/pdf", size: 10 })).toBe("deck.pdf isn't a JPG, PNG or WebP picture, or an MP4 or MOV video.");
    expect(fileType({ name: "deck.pdf", type: "application/pdf" }, { pdf: true })).toBe("application/pdf");
    expect(fileType({ name: "deck.PDF", type: "" }, { pdf: true })).toBe("application/pdf");
    expect(fileProblem({ name: "deck.pdf", type: "application/pdf", size: 20_000_000 }, { pdf: true })).toBeNull();
    expect(fileProblem({ name: "deck.pdf", type: "application/pdf", size: 20_000_001 }, { pdf: true })).toBe("deck.pdf is over 20 MB.");
    expect(fileProblem({ name: "big.jpg", type: "image/jpeg", size: 8_000_001 }, { pdf: true })).toBe("big.jpg is over 8 MB.");
    expect(uploadName("My carousel.pdf", "application/pdf", 0)).toBe("My-carousel-1.pdf");
    expect(PDF_LINKEDIN_ONLY).toMatch(/^Only LinkedIn takes a PDF/);
  });

  it("names each upload plainly, numbered, with the type's own ending", () => {
    expect(uploadName("My r\u00e9el (final).MOV", "video/quicktime", 0)).toBe("My-reel-final-1.mov");
    expect(uploadName("../../etc/passwd.png", "image/png", 2)).toBe("etc-passwd-3.png");
    expect(uploadName("...", "image/jpeg", 0)).toBe("media-1.jpg");
  });
});

describe("uploading", () => {
  it("presigns and PUTs each file in order with its type, and returns the public links", async () => {
    const files = [
      { file: blob(100), name: "slide.png", type: "image/png" },
      { file: blob(300), name: "slide.png", type: "image/png" },
    ];
    const seen: number[] = [];
    const urls = await uploadAll("me", files, new Map(), (p) => seen.push(p));
    expect(urls).toEqual(["https://media.zernio.com/temp/slide-1.png", "https://media.zernio.com/temp/slide-2.png"]);
    expect(callFn.mock.calls.map((c) => c[1])).toEqual([
      { action: "presign", profileId: "me", filename: "slide-1.png", contentType: "image/png", size: 100 },
      { action: "presign", profileId: "me", filename: "slide-2.png", contentType: "image/png", size: 300 },
    ]);
    expect(puts).toEqual([
      { url: "https://storage.example/put/slide-1.png?sig=1", type: "image/png", size: 100 },
      { url: "https://storage.example/put/slide-2.png?sig=1", type: "image/png", size: 300 },
    ]);
    expect(seen[0]).toBe(0);
    expect(seen).toContain(13); // half of the first file: 50 of 400 bytes
    expect(seen.at(-1)).toBe(100);
  });

  it("keeps what went up when one fails, so trying again sends only the rest", async () => {
    const files = [
      { file: blob(10), name: "a.png", type: "image/png" },
      { file: blob(10), name: "b.png", type: "image/png" },
    ];
    const done = new Map<Blob, string>();
    answers = [200, 0];
    const err = await uploadAll("me", files, done, () => {}).catch((e) => e);
    expect(err).toBeInstanceOf(UploadError);
    expect(err.message).toMatch(/didn't go through/);
    expect([...done.values()]).toEqual(["https://media.zernio.com/temp/a-1.png"]);
    answers = [];
    expect(await uploadAll("me", files, done, () => {})).toEqual(["https://media.zernio.com/temp/a-1.png", "https://media.zernio.com/temp/b-2.png"]);
    expect(puts.map((p) => p.url)).toEqual([
      "https://storage.example/put/a-1.png?sig=1",
      "https://storage.example/put/b-2.png?sig=1",
      "https://storage.example/put/b-2.png?sig=1",
    ]);
  });

  it("says a refused PUT plainly", async () => {
    answers = [403];
    await expect(uploadAll("me", [{ file: blob(5), name: "a.mp4", type: "video/mp4" }], new Map(), () => {})).rejects.toThrow("The upload was refused (403). Try again.");
  });
});

describe("the draft's link", () => {
  it("keeps only https post links and the first reason", () => {
    expect(
      linkFromView("k", {
        id: "p1",
        status: "partial",
        scheduledFor: "2026-10-12T01:00:00.000Z",
        platforms: [
          { platform: "instagram", accountId: "a", status: "published", url: "https://www.instagram.com/p/x/", error: "" },
          { platform: "linkedin", accountId: "b", status: "failed", url: null, error: "Token expired" },
        ],
      }),
    ).toEqual({ key: "k", postId: "p1", status: "partial", at: "2026-10-12T01:00:00.000Z", links: [{ platform: "instagram", url: "https://www.instagram.com/p/x/" }], error: "Token expired", platforms: ["instagram", "linkedin"] });
  });
});

describe("the draft as it goes out", () => {
  it("takes the draft's day and time as Singapore time, or none without a time", () => {
    expect(zernioTime("2026-10-14T09:30")).toBe("2026-10-14T09:30:00+08:00");
    expect(zernioTime("2026-10-14", "18:05")).toBe("2026-10-14T18:05:00+08:00");
    expect(zernioTime("2026-10-14T09:30", "07:00")).toBe("2026-10-14T07:00:00+08:00");
    expect(zernioTime("2026-10-14")).toBeNull();
    expect(zernioTime("2026-10-14", "24:00")).toBeNull();
    expect(zernioTime(undefined, "09:00")).toBeNull();
  });

  it("is the text a copy would paste: plain, signed off, disclosed", () => {
    const d = { draft: "**Three** checks.", disclosure: [], platform: "instagram", hook: "", pillarDetail: "" };
    expect(postText(d, null)).toBe("Three checks.");
    expect(postText(d, { color: "#000", name: "", handle: "", signOff: "Leo, AIA" })).toBe("Three checks.\n\nLeo, AIA");
  });

  it("adds the remix credit last, only when it is ticked", () => {
    const source = { key: "top:a-1", kind: "top-post" as const, author: "@mrbrown", remixedAt: "" };
    const d = { draft: "Three checks.", disclosure: [], platform: "instagram", hook: "", pillarDetail: "" };
    expect(postText({ ...d, source }, null)).toBe("Three checks.");
    expect(postText({ ...d, source: { ...source, credit: true } }, null)).toBe("Three checks.\n\nIdea from @mrbrown.");
    expect(postText({ ...d, source: { ...source, credit: true, kind: "own" } }, null)).toBe("Three checks.");
  });
});

describe("the status chip", () => {
  const link = (extra = {}) => ({ key: "k", postId: "p", ...extra });
  it("says where the post is", () => {
    expect(chipOf(undefined)).toBeNull();
    expect(chipOf({ key: "k" })).toBeNull();
    expect(chipOf(link({ status: "scheduled", at: "2026-10-14T01:30:00.000Z" }))).toEqual({ label: expect.stringMatching(/^Scheduled .*14.*9:30/), tone: "wait" });
    expect(chipOf(link({ status: "published" }))).toEqual({ label: "Posted", tone: "good" });
    expect(chipOf(link({ status: "failed" }))).toEqual({ label: "Failed", tone: "bad" });
  });

  it("offers cancel until anything is live, retry only after a failure", () => {
    expect(canCancel(link({ status: "scheduled" }))).toBe(true);
    expect(canCancel(link({ status: "failed" }))).toBe(true);
    expect(canCancel(link({ status: "partial" }))).toBe(false);
    expect(canCancel(link({ status: "publishing", links: [{ platform: "instagram", url: "https://x" }] }))).toBe(false);
    expect(canRetry(link({ status: "failed" }))).toBe(true);
    expect(canRetry(link({ status: "scheduled" }))).toBe(false);
  });

  it("asks Zernio again only once the time has come and the post hasn't settled", () => {
    const now = Date.parse("2026-10-14T02:00:00Z");
    expect(isDue(link({ status: "scheduled", at: "2026-10-14T01:30:00Z" }), now)).toBe(true);
    expect(isDue(link({ status: "scheduled", at: "2026-10-14T03:00:00Z" }), now)).toBe(false);
    expect(isDue(link({ status: "published", at: "2026-10-14T01:30:00Z" }), now)).toBe(false);
    expect(isDue({ key: "k" }, now)).toBe(false);
  });

  it("says a partly posted post went wrong somewhere, offers Retry but never Cancel, and stops asking about it", () => {
    const now = Date.now();
    const partial = link({ status: "partial", at: new Date(now - 3600_000).toISOString() });
    expect(chipOf(partial)).toEqual({ label: "Partly posted", tone: "bad" });
    expect(canRetry(partial)).toBe(true);
    expect(canCancel(partial)).toBe(false);
    expect(isDue(partial, now)).toBe(false);
  });

  it("shows Posting while it goes out, and a cancelled post offers neither Retry nor Cancel and is not asked about again", () => {
    const now = Date.now();
    const going = link({ status: "publishing", at: new Date(now - 60_000).toISOString() });
    expect(chipOf(going)).toEqual({ label: "Posting", tone: "wait" });
    expect(isDue(going, now)).toBe(true);
    const cancelled = link({ status: "cancelled", at: new Date(now - 60_000).toISOString() });
    expect(chipOf(cancelled)).toEqual({ label: "Cancelled", tone: "muted" });
    expect(canCancel(cancelled)).toBe(false);
    expect(canRetry(cancelled)).toBe(false);
    expect(isDue(cancelled, now)).toBe(false);
  });

  it("asks Zernio about a post it sent without a time, which says just Scheduled", () => {
    expect(chipOf(link({ status: "scheduled" }))).toEqual({ label: "Scheduled", tone: "wait" });
    expect(isDue(link({ status: "scheduled" }))).toBe(true);
  });
});

// Pins (phase 7a post-libs): today's answers on fixed inputs, so the draft and inbox changes keep them.
describe("pins: the chip and the link as they read before inbox drafts", () => {
  it("names every status Zernio sends", () => {
    const at = "2026-10-14T01:30:00.000Z";
    const rows = ["draft", "scheduled", "publishing", "published", "partial", "failed", "cancelled", "unknown", undefined].map((status) => [status, chipOf({ key: "k", postId: "p", status, at })]);
    expect(rows).toEqual([
      ["draft", { label: "Scheduled Wed, 14 Oct, 9:30 am", tone: "wait" }],
      ["scheduled", { label: "Scheduled Wed, 14 Oct, 9:30 am", tone: "wait" }],
      ["publishing", { label: "Posting", tone: "wait" }],
      ["published", { label: "Posted", tone: "good" }],
      ["partial", { label: "Partly posted", tone: "bad" }],
      ["failed", { label: "Failed", tone: "bad" }],
      ["cancelled", { label: "Cancelled", tone: "muted" }],
      ["unknown", { label: "Scheduled Wed, 14 Oct, 9:30 am", tone: "wait" }],
      [undefined, { label: "Scheduled Wed, 14 Oct, 9:30 am", tone: "wait" }],
    ]);
  });

  it("reads a one-network post the same way, a TikTok photo post with no link and two accounts on one network included", () => {
    expect(linkFromView("k1", { id: "p1", status: "published", scheduledFor: null, platforms: [{ platform: "tiktok", accountId: "t", status: "published", url: null, error: "" }] })).toEqual({ key: "k1", postId: "p1", status: "published" });
    expect(linkFromView("k2", { id: "p2", status: "scheduled", scheduledFor: "2026-10-20T01:00:00.000Z", platforms: [{ platform: "instagram", accountId: "a", status: "pending", url: null, error: "" }] })).toEqual({ key: "k2", postId: "p2", status: "scheduled", at: "2026-10-20T01:00:00.000Z" });
    expect(
      linkFromView("k3", {
        id: "p3",
        status: "published",
        scheduledFor: "2026-10-20T01:00:00.000Z",
        platforms: [
          { platform: "instagram", accountId: "a", status: "published", url: "https://www.instagram.com/p/a/", error: "" },
          { platform: "instagram", accountId: "b", status: "published", url: "http://insecure.example/b", error: "" },
        ],
      }),
    ).toEqual({ key: "k3", postId: "p3", status: "published", at: "2026-10-20T01:00:00.000Z", links: [{ platform: "instagram", url: "https://www.instagram.com/p/a/" }] });
  });
});

describe("tracked links in the post", () => {
  const brand = { color: "#000", name: "", handle: "", signOff: "Book a call: https://acme.sg/call", tagLinks: true };
  const d = { draft: "Read https://acme.sg/guide.", disclosure: [], platform: "linkedin", hook: "Three CPF checks before 55", pillarDetail: "Retirement" };

  it("tags every link with the platform and the hook when the brand kit asks, the sign-off's too", () => {
    const tag = "utm_source=linkedin&utm_medium=social&utm_campaign=three-cpf-checks-before-55";
    expect(postText(d, brand)).toBe(`Read https://acme.sg/guide?${tag}.\n\nBook a call: https://acme.sg/call?${tag}`);
  });

  it("names the campaign after the topic when there is no hook, else post, and leaves links alone when the kit doesn't ask", () => {
    expect(postText({ ...d, hook: "" }, brand)).toContain("https://acme.sg/guide?utm_source=linkedin&utm_medium=social&utm_campaign=retirement.");
    expect(postText({ ...d, hook: "", pillarDetail: "" }, brand)).toContain("utm_campaign=post.");
    expect(postText(d, { ...brand, tagLinks: false })).toBe("Read https://acme.sg/guide.\n\nBook a call: https://acme.sg/call");
  });
});

describe("a thread", () => {
  const thread = ["Most people pay for their hospital stay twice.", "First the premium.", "Then the co-pay."];
  it("is sent with the schedule as it is, its first post as the content", async () => {
    callFn.mockResolvedValueOnce({ post: { id: "p1" } });
    await schedulePost("me", { accountIds: ["65000000000000000000a005"], clientKey: "k", content: thread[0], mediaUrls: [], thread });
    expect(callFn.mock.calls[0][1]).toEqual({ action: "schedule", profileId: "me", accountIds: ["65000000000000000000a005"], clientKey: "k", content: thread[0], mediaUrls: [], thread });
  });
  it("is refused beside another network in the panel with the server's own words", () => {
    const input = { clientKey: "k", content: thread[0], captions: {}, mediaUrls: [], scheduledFor: null, firstComment: "", tiktok: null, youtube: null, thread };
    expect(platformProblem(input, ["threads", "facebook"])).toBe(THREAD_MIXED);
    expect(platformProblem(input, ["threads"])).toBeNull();
  });
});

// publish-tiktok: Zernio marks a TikTok inbox draft published with platformSpecificData.isDraft and no link
// (docs.zernio.com/platforms/tiktok/posts.mdx, as the spec read it on 20 Oct 2026); social-server reads it into `draft`.
describe("TikTok inbox drafts", () => {
  const entry = (platform: string, extra = {}) => ({ platform, accountId: platform[0], status: "published", url: null, error: "", draft: false, ...extra });
  const inbox = { id: "p1", status: "published" as const, scheduledFor: "2026-10-20T01:00:00.000Z", platforms: [entry("tiktok", { draft: true })] };
  const mixed = { ...inbox, platforms: [entry("instagram", { url: "https://www.instagram.com/p/x/" }), entry("tiktok", { draft: true })] };

  it("keeps the draft platforms on the link, and the platforms when there are several", () => {
    expect(linkFromView("k", inbox)).toEqual({ key: "k", postId: "p1", status: "published", at: "2026-10-20T01:00:00.000Z", drafts: ["tiktok"] });
    expect(linkFromView("k", mixed)).toEqual({
      key: "k",
      postId: "p1",
      status: "published",
      at: "2026-10-20T01:00:00.000Z",
      links: [{ platform: "instagram", url: "https://www.instagram.com/p/x/" }],
      platforms: ["instagram", "tiktok"],
      drafts: ["tiktok"],
    });
    expect(linkFromView("k", { ...mixed, platforms: [entry("instagram"), entry("linkedin")] }).platforms).toEqual(["instagram", "linkedin"]);
  });

  it("reads In your TikTok inbox while every entry is a draft, Posted once one is live or it is marked posted", () => {
    expect(chipOf(linkFromView("k", inbox))).toEqual({ label: "In your TikTok inbox", tone: "wait" });
    expect(chipOf(linkFromView("k", mixed))).toEqual({ label: "Posted", tone: "good" });
    expect(chipOf(linkFromView("k", inbox), true)).toEqual({ label: "Posted", tone: "good" });
    // a draft entry on a post that isn't published yet still reads by its status
    expect(chipOf({ ...linkFromView("k", inbox), status: "publishing" })).toEqual({ label: "Posting", tone: "wait" });
  });

  it("postedNow is false when every published entry is a draft, true once one non-draft entry is published", () => {
    expect(postedNow(inbox)).toBe(false);
    expect(postedNow({ ...inbox, platforms: [entry("tiktok", { draft: true }), entry("tiktok", { draft: true, accountId: "u" })] })).toBe(false);
    expect(postedNow(mixed)).toBe(true);
    expect(postedNow({ ...inbox, platforms: [entry("tiktok")] })).toBe(true);
    // as applyView read it before: only a published post, and one with no entries listed still counts
    expect(postedNow({ ...mixed, status: "partial" })).toBe(false);
    expect(postedNow({ ...inbox, platforms: [] })).toBe(true);
  });

  it("puts TikTok's three limits in plain words and passes anything else through", () => {
    expect(tiktokReason("TikTok allows only 5 pending drafts per account in any 24-hour period. Please wait before sending more drafts.")).toBe(
      "TikTok holds 5 drafts at most. Finish or delete drafts in the TikTok app, then retry.",
    );
    expect(tiktokReason("TikTok direct posting is at capacity right now. Please try again later.")).toBe(TIKTOK_BUSY);
    expect(TIKTOK_BUSY).toBe("TikTok is busy for direct posts right now. Send it to your inbox instead, or retry in a few hours.");
    expect(tiktokReason("You have created too many posts in the last 24 hours via the API.")).toBe("TikTok's daily limit for this account is reached. Try tomorrow, or post it in the TikTok app.");
    expect(tiktokReason("Video duration is too long")).toBe("Video duration is too long");
  });

  // live-p7a-post D3: TikTok's answer to Leo's inbox draft, as Zernio returned it (calls/045)
  const REFUSED =
    "TikTok Business API /business/photo/publish/ failed (code 40002): Please notice the user to update their TikTok to the latest version to enable this functionality. (request_id 202610260941444230F7F99CAAE0447502)";
  it("an old TikTok app on the posting phone reads as one plain line, with none of the raw text", () => {
    expect(tiktokReason(REFUSED)).toBe(TIKTOK_UPDATE);
    expect(TIKTOK_UPDATE).toBe("Update the TikTok app on the phone signed in to this account, then try again.");
  });

  it("any other refusal from TikTok's API drops the API path and the request id", () => {
    const other = "TikTok Business API /business/video/publish/ failed (code 40100): The video is too short. (request_id 2026102609AB)";
    expect(tiktokReason(other)).toBe("TikTok refused it. The video is too short.");
    for (const s of [tiktokReason(REFUSED), tiktokReason(other)]) expect(s).not.toMatch(/request_id|Business API|code \d/);
  });
});

// publish-schedule: the slides are drawn before step 1, one at a time, with a count and a cancel.
describe("renderEach", () => {
  it("draws one item at a time and counts each one", async () => {
    const order: string[] = [];
    const seen: [number, number][] = [];
    const out = await renderEach(["a", "b", "c"], async (t) => (order.push(t), new Blob([t])), (done, total) => seen.push([done, total]), new AbortController().signal);
    expect(order).toEqual(["a", "b", "c"]);
    expect(seen).toEqual([[1, 3], [2, 3], [3, 3]]);
    expect(await Promise.all(out.map((b) => b.text()))).toEqual(["a", "b", "c"]);
  });

  it("draws nothing after the signal aborts, and rejects with an AbortError", async () => {
    const stop = new AbortController();
    const drawn: number[] = [];
    const seen: number[] = [];
    const run = renderEach([1, 2, 3, 4], async (n) => {
      drawn.push(n);
      if (n === 2) stop.abort();
      return new Blob([String(n)]);
    }, (done) => seen.push(done), stop.signal);
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(drawn).toEqual([1, 2]);
    expect(seen).toEqual([1]);
    const before = new AbortController();
    before.abort();
    const none: number[] = [];
    await expect(renderEach([1], async (n) => (none.push(n), new Blob()), () => {}, before.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(none).toEqual([]);
  });
});

// publish-schedule: one reason a step can't go on, the same words the tests read.
describe("stepProblem", () => {
  const now = Date.parse("2026-10-20T00:00:00Z");
  const png = (n: number) => Array.from({ length: n }, (_, i) => `https://upload.local/${i}.png`);
  const form = (extra = {}) => ({
    platforms: ["linkedin"],
    accounts: [{ platform: "linkedin" }],
    mediaUrls: png(3),
    scheduledFor: "2026-10-21T09:00:00+08:00",
    content: "Three CPF checks before 55.",
    ...extra,
  });

  it("where: an account for every ticked network, then the media each network takes", () => {
    expect(stepProblem("where", form(), now)).toBeNull();
    expect(stepProblem("where", form({ platforms: [] }), now)).toBe("Pick an account to post to.");
    expect(stepProblem("where", form({ platforms: ["linkedin", "instagram"] }), now)).toBe("Choose an account to post to Instagram.");
    const ig = { platforms: ["instagram"], accounts: [{ platform: "instagram" }] };
    expect(stepProblem("where", form({ ...ig, mediaUrls: [] }), now)).toBe("Instagram needs a picture or video.");
    expect(stepProblem("where", form({ platforms: ["youtube"], accounts: [{ platform: "youtube" }] }), now)).toBe("YouTube takes one video.");
    expect(stepProblem("where", form({ mediaUrls: ["https://upload.local/0.webp"] }), now)).toBe("LinkedIn takes JPG or PNG pictures.");
    // a video to Instagram and YouTube goes
    expect(stepProblem("where", form({ platforms: ["instagram", "youtube"], accounts: [{ platform: "instagram" }, { platform: "youtube" }], mediaUrls: ["https://upload.local/0.mp4"] }), now)).toBeNull();
  });

  it("where: picked files with the server's caps, and nothing about the caption or TikTok's privacy yet", () => {
    expect(stepProblem("where", form({ files: [{ name: "big.jpg", type: "image/jpeg", size: 8_000_001 }] }), now)).toBe("big.jpg is over 8 MB.");
    expect(stepProblem("where", form({ files: Array.from({ length: 11 }, () => ({ name: "a.jpg", type: "image/jpeg", size: 10 })) }), now)).toBe("Pick up to 10 pictures.");
    expect(stepProblem("where", form({ content: "x".repeat(3001) }), now)).toBeNull();
    expect(stepProblem("where", form({ platforms: ["tiktok"], accounts: [{ platform: "tiktok" }] }), now)).toBeNull();
    expect(stepProblem("where", form({ platforms: ["threads", "facebook"], accounts: [{ platform: "threads" }, { platform: "facebook" }], thread: ["One.", "Two."] }), now)).toBe(THREAD_MIXED);
  });

  it("when: now, a time ahead, a passed time, a time not picked yet", () => {
    expect(stepProblem("when", form({ scheduledFor: null }), now)).toBeNull();
    expect(stepProblem("when", form(), now)).toBeNull();
    expect(stepProblem("when", form({ scheduledFor: "2026-10-20T08:00:30+08:00" }), now)).toBe("That time has passed. Pick a later time, or post now.");
    expect(stepProblem("when", form({ scheduledFor: "" }), now)).toBe("Pick a day and time.");
  });

  it("caption: each network's length and compliance, named by the network", () => {
    const two = { platforms: ["linkedin", "instagram"], accounts: [{ platform: "linkedin" }, { platform: "instagram" }] };
    expect(stepProblem("caption", form(two), now)).toBeNull();
    expect(stepProblem("caption", form({ ...two, content: "x".repeat(2210) }), now)).toBe("The Instagram caption is 10 characters too long.");
    expect(stepProblem("caption", form({ ...two, content: "x".repeat(2210), captions: { instagram: "Short for Instagram." } }), now)).toBeNull();
    expect(stepProblem("caption", form({ ...two, captions: { instagram: "This plan is risk-free." } }), now)).toBe("Fix the compliance error in the Instagram caption first.");
    expect(stepProblem("caption", form({ ...two, content: "This plan is risk-free.", captions: { instagram: "Fine here." } }), now)).toBe("Fix the compliance error in the LinkedIn caption first.");
    expect(stepProblem("caption", form({ platforms: ["threads"], accounts: [{ platform: "threads" }], mediaUrls: [], thread: ["One.", "Risk-free, every year."] }), now)).toBe("Fix the compliance error in the thread first.");
  });

  it("caption: the server's other rules, TikTok's privacy and an empty text post", () => {
    const tiktok = { platforms: ["tiktok"], accounts: [{ platform: "tiktok" }] };
    expect(stepProblem("caption", form(tiktok), now)).toBe("Pick who can see it on TikTok.");
    expect(stepProblem("caption", form({ ...tiktok, tiktok: { privacyLevel: "SELF_ONLY", allowComment: true, allowDuet: false, allowStitch: false } }), now)).toBeNull();
    expect(stepProblem("caption", form({ mediaUrls: [], content: "" }), now)).toBe("Write the caption, or attach a picture or video.");
  });

  it("opens the step a link asks for, or the first step before it that can't go on", () => {
    expect(stepToOpen("caption", form(), now)).toBe("caption");
    expect(stepToOpen("caption", form({ scheduledFor: "2026-10-19T09:00:00+08:00" }), now)).toBe("when");
    expect(stepToOpen("caption", form({ platforms: ["instagram"] }), now)).toBe("where");
    expect(stepToOpen("when", form({ content: "" , mediaUrls: [] }), now)).toBe("when");
    expect(stepToOpen(null, form(), now)).toBe("where");
    expect(stepToOpen("bogus" as never, form(), now)).toBe("where");
  });
});
