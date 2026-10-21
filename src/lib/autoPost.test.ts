import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));

const { PDF_LINKEDIN_ONLY, THREAD_MIXED, canCancel, canRetry, chipOf, fileProblem, fileType, isDue, linkFromView, platformProblem, postText, schedulePost, uploadAll, uploadName, UploadError, zernioTime } = await import("./autoPost");

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
    ).toEqual({ key: "k", postId: "p1", status: "partial", at: "2026-10-12T01:00:00.000Z", links: [{ platform: "instagram", url: "https://www.instagram.com/p/x/" }], error: "Token expired" });
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
