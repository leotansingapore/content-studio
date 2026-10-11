import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));

const { fileProblem, fileType, linkFromView, uploadAll, uploadName, UploadError } = await import("./autoPost");

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
