import { describe, expect, it } from "vitest";
import { exampleCsv, importDrafts, MAX_IMPORT_ROWS, parseCsv, parseDay, planImport } from "./csvImport";

describe("parseCsv", () => {
  it("handles quoted commas, escaped quotes and line breaks inside a field", () => {
    expect(parseCsv('a,"b, c","say ""hi""","two\nlines"\n1,2,3,4')).toEqual([
      ["a", "b, c", 'say "hi"', "two\nlines"],
      ["1", "2", "3", "4"],
    ]);
  });
  it("strips a BOM, reads CRLF and CR, keeps empty fields and drops blank lines", () => {
    expect(parseCsv("\uFEFFhook,text\r\nx,\r\n\r\ny,z\rw,\"\"")).toEqual([["hook", "text"], ["x", ""], ["y", "z"], ["w", ""]]);
  });
  it("turns a Windows line break inside a quoted field into a plain one", () => {
    expect(parseCsv('"a\r\nb",c\r\n')).toEqual([["a\nb", "c"]]);
  });
  it("reads a last line with no newline, and a trailing empty field", () => {
    expect(parseCsv("a,b,")).toEqual([["a", "b", ""]]);
  });
});

describe("parseDay", () => {
  it("takes YYYY-MM-DD and day-first D/M/YYYY, and refuses impossible days", () => {
    expect(parseDay("2026-10-20")).toBe("2026-10-20");
    expect(parseDay("2026-1-5")).toBe("2026-01-05");
    expect(parseDay("12/10/2026")).toBe("2026-10-12");
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("next Tuesday")).toBeNull();
  });
});

describe("planImport", () => {
  const csv = [
    "Topic,Post text,Platform,Scheduled date",
    "CPF at 55,Three checks,LI,2026-10-20",
    "Term first,,Threads,",
    ",,,",
    "ILP or not,Depends,instagram,31/02/2026",
    "Rider,,,",
  ].join("\n");

  it("maps loosely named headers, falls back on the default platform and says why", () => {
    const { rows, skipped } = planImport(csv, "facebook", 50);
    expect(skipped).toBe(0);
    expect(rows.map((r) => [r.row, r.hook, r.text, r.platform, r.date, r.notes])).toEqual([
      [1, "CPF at 55", "Three checks", "linkedin", "2026-10-20", []],
      [2, "Term first", "", "facebook", null, ['Unknown platform "Threads", using Facebook']],
      [3, "ILP or not", "Depends", "instagram", null, ['"31/02/2026" isn\'t a date (use YYYY-MM-DD), saved without one']],
      [4, "Rider", "", "facebook", null, []],
    ]);
  });

  it("reads columns in order when there is no header row", () => {
    const { rows } = planImport("Post idea one,Body,tiktok,2026-11-01\nHook two", "linkedin", 50);
    expect(rows.map((r) => [r.row, r.hook, r.platform, r.date])).toEqual([
      [1, "Post idea one", "tiktok", "2026-11-01"],
      [2, "Hook two", "linkedin", null],
    ]);
  });

  it("marks rows past the room left, and reads at most 200 rows", () => {
    expect(planImport(csv, "linkedin", 2).rows.map((r) => r.fits)).toEqual([true, true, false, false]);
    const big = ["hook", ...Array.from({ length: MAX_IMPORT_ROWS + 5 }, (_, i) => `Idea ${i}`)].join("\n");
    const plan = planImport(big, "linkedin", 999);
    expect(plan.rows).toHaveLength(MAX_IMPORT_ROWS);
    expect(plan.skipped).toBe(5);
  });

  it("saves rows that fit as drafts, scheduled when dated, in file order", () => {
    const drafts = importDrafts(planImport(csv, "linkedin", 3), Date.parse("2026-10-08T00:00:00Z"));
    expect(drafts.map((d) => [d.hook, d.status, d.scheduledFor ?? null, d.platform])).toEqual([
      ["CPF at 55", "scheduled", "2026-10-20", "linkedin"],
      ["Term first", "draft", null, "linkedin"],
      ["ILP or not", "draft", null, "instagram"],
    ]);
    expect(drafts[0].createdAt > drafts[1].createdAt).toBe(true);
  });

  it("the example file imports cleanly", () => {
    const { rows } = planImport(exampleCsv("2026-10-08"), "linkedin", 50);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.notes.length === 0)).toBe(true);
    expect(rows[0].date).toBe("2026-10-11");
    expect(rows[2].text).toBe("Short answer: it depends.\nLong answer below.");
  });
});
