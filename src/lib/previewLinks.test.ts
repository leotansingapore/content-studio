import { describe, expect, it } from "vitest";
import { isLinkLive, linksByDraft, previewUrl, reviewerCommentCount, type PreviewComment, type PreviewLink } from "./previewLinks";

const link = (id: string, draft: string, created: string, extra: Partial<PreviewLink> = {}): PreviewLink => ({
  id,
  draft_id: draft,
  sender_name: "Ada",
  title: "",
  platform: "linkedin",
  format: "text-post",
  content: "x",
  created_at: created,
  expires_at: "2026-10-22T00:00:00Z",
  revoked_at: null,
  ...extra,
});

describe("previewUrl", () => {
  it("builds the public page address", () => {
    expect(previewUrl("https://consultant-content-studio.vercel.app/", "abc")).toBe(
      "https://consultant-content-studio.vercel.app/review/abc",
    );
  });
});

describe("isLinkLive", () => {
  const now = Date.parse("2026-10-10T00:00:00Z");
  it("is live until it expires or is turned off", () => {
    expect(isLinkLive({ revoked_at: null, expires_at: "2026-10-22T00:00:00Z" }, now)).toBe(true);
    expect(isLinkLive({ revoked_at: null, expires_at: "2026-10-09T23:59:59Z" }, now)).toBe(false);
    expect(isLinkLive({ revoked_at: "2026-10-09T00:00:00Z", expires_at: "2026-10-22T00:00:00Z" }, now)).toBe(false);
  });
});

describe("linksByDraft", () => {
  it("groups by draft, newest first", () => {
    const m = linksByDraft([
      link("a", "d1", "2026-10-01T00:00:00Z"),
      link("b", "d2", "2026-10-02T00:00:00Z"),
      link("c", "d1", "2026-10-03T00:00:00Z"),
    ]);
    expect(m.get("d1")?.map((l) => l.id)).toEqual(["c", "a"]);
    expect(m.get("d2")?.map((l) => l.id)).toEqual(["b"]);
  });
});

describe("reviewerCommentCount", () => {
  it("counts only reviewer comments on the given links", () => {
    const c = (id: number, linkId: string, fromOwner: boolean): PreviewComment => ({
      id,
      link_id: linkId,
      from_owner: fromOwner,
      author_name: "x",
      body: "y",
      created_at: "2026-10-01T00:00:00Z",
    });
    expect(reviewerCommentCount([c(1, "a", false), c(2, "a", true), c(3, "b", false)], new Set(["a"]))).toBe(1);
  });
});
