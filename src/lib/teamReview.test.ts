import { describe, expect, it } from "vitest";
import {
  auditCsv,
  auditCsvFilename,
  buildCsv,
  canSubmitForReview,
  csvCell,
  deriveReviewState,
  formatInviteCode,
  formatSgt,
  friendlyError,
  inviteLink,
  isWellFormedInviteCode,
  latestSubmissionByDraft,
  normalizeInviteCode,
  normalizeReviewText,
  reviewHash,
  reviewTextForDraft,
  sgtDayBounds,
  sha256Hex,
  type ReviewEvent,
  type ReviewSubmission,
} from "./teamReview";

const sub = (over: Partial<ReviewSubmission> = {}): ReviewSubmission => ({
  id: "s1",
  team_id: "t1",
  author_id: "u1",
  author_name: "Mei",
  draft_id: "d1",
  platform: "linkedin",
  format: "text-post",
  content: "hello",
  compliance_flags: [],
  content_hash: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  status: "approved",
  reviewer_id: "u2",
  reviewer_name: "Lee",
  review_comment: null,
  submitted_at: "2026-09-01T02:00:00+00:00",
  reviewed_at: "2026-09-01T03:00:00+00:00",
  ...over,
});

describe("normalizeReviewText (mirrors cs_review_normalize)", () => {
  it("turns CRLF and CR into LF", () => {
    expect(normalizeReviewText("a\r\nb\rc")).toBe("a\nb\nc");
  });
  it("trims spaces, tabs and newlines at both ends only", () => {
    expect(normalizeReviewText("\r\n  hello \t\n")).toBe("hello");
    expect(normalizeReviewText("a\n\n b")).toBe("a\n\n b");
  });
  it("leaves other whitespace alone, like the server", () => {
    expect(normalizeReviewText(" hi ")).toBe(" hi ");
  });
});

describe("hashing", () => {
  // Same vectors as 0.1 and 0.2 in supabase/hub/011_team_review.test.sql.
  it("sha256Hex matches known answers", async () => {
    expect(await sha256Hex("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    expect(await sha256Hex("Café — 保险 ✓")).toBe(
      "8e1118666495c640eadac09a634d9366d92cb69555914934358c8c92340a1eac",
    );
  });
  it("reviewHash ignores line-ending and edge whitespace changes only", async () => {
    expect(await reviewHash("  hello\r\n")).toBe(await reviewHash("hello"));
    expect(await reviewHash("hello!")).not.toBe(await reviewHash("hello"));
  });
  it("reviews the post as pasted, without markdown", () => {
    expect(reviewTextForDraft("**Hook**\r\n\n- one point  ")).toBe("Hook\n\n• one point");
  });
});

describe("deriveReviewState", () => {
  const helloHash = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
  it("none without a submission", () => {
    expect(deriveReviewState(undefined, helloHash)).toBe("none");
  });
  it("pending and changes requested regardless of edits", () => {
    expect(deriveReviewState(sub({ status: "pending" }), "other")).toBe("pending");
    expect(deriveReviewState(sub({ status: "changes_requested" }), helloHash)).toBe(
      "changes_requested",
    );
  });
  it("approved only while the text hash still matches", async () => {
    expect(deriveReviewState(sub(), await reviewHash("hello\n"))).toBe("approved");
    expect(deriveReviewState(sub(), await reviewHash("hello, edited"))).toBe(
      "edited_since_approval",
    );
  });
  it("allows (re)submitting only when there is nothing open or approved as-is", () => {
    expect(canSubmitForReview("none")).toBe(true);
    expect(canSubmitForReview("changes_requested")).toBe(true);
    expect(canSubmitForReview("edited_since_approval")).toBe(true);
    expect(canSubmitForReview("pending")).toBe(false);
    expect(canSubmitForReview("approved")).toBe(false);
  });
  it("latestSubmissionByDraft keeps the newest per draft", () => {
    const older = sub({ id: "old", submitted_at: "2026-09-01T02:00:00+00:00" });
    const newer = sub({ id: "new", submitted_at: "2026-09-02T02:00:00+00:00", status: "pending" });
    const other = sub({ id: "x", draft_id: "d2" });
    const map = latestSubmissionByDraft([newer, other, older]);
    expect(map.get("d1")?.id).toBe("new");
    expect(map.get("d2")?.id).toBe("x");
  });
});

describe("invite codes", () => {
  it("normalises case and separators", () => {
    expect(normalizeInviteCode(" abcde-fghjk ")).toBe("ABCDEFGHJK");
    expect(formatInviteCode("abcdefghjk")).toBe("ABCDE-FGHJK");
  });
  it("accepts only 10 characters from the unambiguous alphabet", () => {
    expect(isWellFormedInviteCode("ABCDE-FGHJK")).toBe(true);
    expect(isWellFormedInviteCode("ABCDEFGHJ")).toBe(false);
    expect(isWellFormedInviteCode("ABCDEFGHJO")).toBe(false);
    expect(isWellFormedInviteCode("ABCDEFGHJ1")).toBe(false);
  });
  it("builds a /team?code= link", () => {
    expect(inviteLink("https://studio.example/", "abcde-fghjk")).toBe(
      "https://studio.example/team?code=ABCDEFGHJK",
    );
  });
});

describe("CSV", () => {
  it("quotes every cell and doubles quotes", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell(42)).toBe('"42"');
  });
  it("neutralises formula injection", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell("+1+1")).toBe('"\'+1+1"');
    expect(csvCell("-2+3")).toBe('"\'-2+3"');
    expect(csvCell("@SUM(A1)")).toBe('"\'@SUM(A1)"');
    expect(csvCell("\t=1")).toBe('"\'\t=1"');
    expect(csvCell("\r=1")).toBe('"\'\r=1"');
    expect(csvCell("  =1+1")).toBe('"\'  =1+1"');
  });
  it("leaves ordinary text alone", () => {
    expect(csvCell("Approved - looks fine")).toBe('"Approved - looks fine"');
    expect(csvCell("2026-09-15 10:00:00")).toBe('"2026-09-15 10:00:00"');
  });
  it("builds rows with CRLF endings", () => {
    expect(buildCsv(["a", "b"], [["1", "=2"]])).toBe('"a","b"\r\n"1","\'=2"\r\n');
  });
  it("exports audit events with Singapore time and escaped values", () => {
    const events: ReviewEvent[] = [
      {
        id: 7,
        team_id: "t1",
        actor_id: "u2",
        actor_name: "=cmd|' /C calc'!A0",
        submission_id: "s1",
        kind: "changes_requested",
        detail: { draft_id: "d1", author_name: "Mei", comment: "Add the disclaimer" },
        content_hash: "abc",
        created_at: "2026-09-15T02:04:05.123+00:00",
      },
      {
        id: 3,
        team_id: "t1",
        actor_id: "u1",
        actor_name: "Mei",
        submission_id: "s1",
        kind: "submitted",
        detail: { draft_id: "d1", platform: "linkedin", format: "text-post" },
        content_hash: "abc",
        created_at: "2026-09-14T16:00:00+00:00",
      },
    ];
    const lines = auditCsv(events).split("\r\n");
    expect(lines[0]).toContain('"time_sgt","time_utc","event","by"');
    expect(lines[1]).toBe(
      '"7","2026-09-15 10:04:05","2026-09-15T02:04:05.123Z","Changes requested","\'=cmd|\' /C calc\'!A0","u2","Mei","s1","d1","","","Add the disclaimer","abc"',
    );
    // A submission's consultant is its actor; midnight SGT is the next day.
    expect(lines[2]).toContain('"2026-09-15 00:00:00"');
    expect(lines[2]).toContain('"Submitted for review","Mei","u1","Mei"');
  });
  it("names the file after the team and range", () => {
    expect(auditCsvFilename("Lee & Co. Advisers!", "2026-09-01", "2026-09-15")).toBe(
      "review-audit-lee-co-advisers-2026-09-01-to-2026-09-15.csv",
    );
    expect(auditCsvFilename("保险", "2026-09-01", "2026-09-15")).toBe(
      "review-audit-team-2026-09-01-to-2026-09-15.csv",
    );
  });
});

describe("Singapore dates", () => {
  it("formats instants in SGT", () => {
    expect(formatSgt("2026-09-15T16:30:00Z")).toBe("2026-09-16 00:30:00");
    expect(formatSgt("not a date")).toBe("not a date");
  });
  it("turns an inclusive day range into half-open UTC bounds", () => {
    expect(sgtDayBounds("2026-09-01", "2026-09-15")).toEqual({
      fromIso: "2026-08-31T16:00:00.000Z",
      toIso: "2026-09-15T16:00:00.000Z",
    });
    expect(sgtDayBounds("2026-09-15", "2026-09-15")).toEqual({
      fromIso: "2026-09-14T16:00:00.000Z",
      toIso: "2026-09-15T16:00:00.000Z",
    });
  });
  it("rejects backwards, malformed and impossible dates", () => {
    expect(sgtDayBounds("2026-09-15", "2026-09-01")).toBeNull();
    expect(sgtDayBounds("2026-9-1", "2026-09-15")).toBeNull();
    expect(sgtDayBounds("2026-02-30", "2026-03-01")).toBeNull();
    expect(sgtDayBounds("", "")).toBeNull();
  });
});

describe("friendlyError", () => {
  it("explains a missing migration", () => {
    expect(friendlyError({ code: "PGRST202", message: "Could not find the function" })).toMatch(
      /isn't switched on/,
    );
    expect(friendlyError({ code: "42P01", message: 'relation "cs_teams" does not exist' })).toMatch(
      /isn't switched on/,
    );
  });
  it("explains network failures", () => {
    expect(friendlyError(new TypeError("Failed to fetch"))).toMatch(/Couldn't reach/);
  });
  it("passes server messages through plainly", () => {
    expect(
      friendlyError({ code: "42501", message: "You can't review your own submission." }),
    ).toBe("You can't review your own submission.");
    expect(friendlyError({ code: "42501", message: "permission denied for table cs_teams" })).toBe(
      "You don't have access to do that.",
    );
    expect(friendlyError(null)).toBe("Something went wrong. Try again.");
  });
});
