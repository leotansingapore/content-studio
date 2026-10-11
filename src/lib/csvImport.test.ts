import { describe, expect, it } from "vitest";
import { exampleCsv, hashtagLine, importDrafts, MAX_IMPORT_ROWS, parseCsv, parseDay, parseTime, planImport } from "./csvImport";

// A fixed clock, so dated rows never drift into the past.
const NOW = new Date(2026, 9, 11, 10, 0);

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
    const { rows, skipped } = planImport(csv, "facebook", 50, NOW);
    expect(skipped).toBe(0);
    expect(rows.map((r) => [r.row, r.hook, r.text, r.platform, r.date, r.notes])).toEqual([
      [1, "CPF at 55", "Three checks", "linkedin", "2026-10-20", []],
      [2, "Term first", "", "facebook", null, ['Unknown platform "Threads", using Facebook']],
      [3, "ILP or not", "Depends", "instagram", null, ['"31/02/2026" isn\'t a date (use YYYY-MM-DD), saved without one']],
      [4, "Rider", "", "facebook", null, []],
    ]);
  });

  it("reads columns in order when there is no header row", () => {
    const { rows } = planImport("Post idea one,Body,tiktok,2026-11-01\nHook two", "linkedin", 50, NOW);
    expect(rows.map((r) => [r.row, r.hook, r.platform, r.date])).toEqual([
      [1, "Post idea one", "tiktok", "2026-11-01"],
      [2, "Hook two", "linkedin", null],
    ]);
  });

  it("marks rows past the room left, and reads at most 200 rows", () => {
    expect(planImport(csv, "linkedin", 2, NOW).rows.map((r) => r.fits)).toEqual([true, true, false, false]);
    const big = ["hook", ...Array.from({ length: MAX_IMPORT_ROWS + 5 }, (_, i) => `Idea ${i}`)].join("\n");
    const plan = planImport(big, "linkedin", 999, NOW);
    expect(plan.rows).toHaveLength(MAX_IMPORT_ROWS);
    expect(plan.skipped).toBe(5);
  });

  it("saves rows that fit as drafts, scheduled when dated, in file order", () => {
    const drafts = importDrafts(planImport(csv, "linkedin", 3, NOW), Date.parse("2026-10-08T00:00:00Z"));
    expect(drafts.map((d) => [d.hook, d.status, d.scheduledFor ?? null, d.platform])).toEqual([
      ["CPF at 55", "scheduled", "2026-10-20", "linkedin"],
      ["Term first", "draft", null, "linkedin"],
      ["ILP or not", "draft", null, "instagram"],
    ]);
    expect(drafts[0].createdAt > drafts[1].createdAt).toBe(true);
  });

  it("the example file imports cleanly", () => {
    const { rows } = planImport(exampleCsv("2026-10-08"), "linkedin", 50, new Date(2026, 9, 8, 8, 0));
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.notes.length === 0)).toBe(true);
    expect(rows[0].date).toBe("2026-10-11");
    expect(rows[2].text).toBe("Short answer: it depends.\nLong answer below.");
  });
});

describe("parseTime", () => {
  it("reads 24 hour and 12 hour times, with or without seconds", () => {
    expect(parseTime("9:00")).toBe("09:00");
    expect(parseTime("21:30")).toBe("21:30");
    expect(parseTime("09:30:00")).toBe("09:30");
    expect(parseTime("9am")).toBe("09:00");
    expect(parseTime("9.30 PM")).toBe("21:30");
    expect(parseTime("12am")).toBe("00:00");
    expect(parseTime("12:15pm")).toBe("12:15");
    expect(parseTime("9:30:00 AM")).toBe("09:30");
  });
  it("refuses a bare hour and impossible times", () => {
    for (const bad of ["9", "25:00", "13pm", "0am", "9:75", "noon", ""]) expect(parseTime(bad)).toBeNull();
  });
});

describe("hashtagLine", () => {
  it("turns words, commas and stray # into one line of tags, leaving out ones the post has", () => {
    expect(hashtagLine("#cpf, retirement  #CPF planning", "")).toBe("#cpf #retirement #planning");
    expect(hashtagLine("cpf retirement", "Plan early. #Retirement")).toBe("#cpf");
    expect(hashtagLine(" , # ", "")).toBe("");
  });
});

describe("planImport with times, media and hashtags", () => {
  const csv = [
    "date,time,platform,hook,text,media,hashtags",
    "2026-10-20,9:00,linkedin,A,Body a,https://drive.google.com/a.jpg,cpf retirement",
    "2026-10-20,9am,LI,B,Body b,,",
    "2026-10-20,09:15,linkedin,C,Body c,,",
    "2026-10-20,9:00,instagram,D,Body d,,",
    "2026-10-01,10:00,linkedin,E,Body e,,",
    "2026-10-11,9:30,linkedin,F,Body f,,",
    "2026-10-21,25:00,linkedin,G,Body g,photo.jpg,",
    ",8pm,linkedin,H,Body h,,",
    "2026-10-22,,linkedin,I,,,",
    "2026-10-22,10:00,linkedin,,,,",
  ].join("\n");
  const plan = planImport(csv, "linkedin", 50, NOW);
  const by = (hook: string) => plan.rows.find((r) => r.hook === hook)!;

  it("keeps a clean row's time, media link and hashtags", () => {
    expect(by("A")).toMatchObject({ date: "2026-10-20", time: "09:00", media: "https://drive.google.com/a.jpg", notes: [] });
    expect(by("A").text).toBe("Body a\n\n#cpf #retirement");
    expect(by("D")).toMatchObject({ platform: "instagram", time: "09:00", notes: [] });
  });

  it("moves a clashing time on the same platform 30 minutes at a time and says from where", () => {
    expect(by("B")).toMatchObject({ time: "09:30", notes: ["Moved from 9am to 9:30am, row 1 is on LinkedIn at 9am"] });
    expect(by("C")).toMatchObject({ time: "10:15", notes: ["Moved from 9:15am to 10:15am, row 1 is on LinkedIn at 9am"] });
  });

  it("never keeps a past date or a time already gone today, and says so", () => {
    expect(by("E")).toMatchObject({ date: null, time: null, notes: ['"2026-10-01" is in the past, saved as a draft'] });
    expect(by("F")).toMatchObject({ date: null, time: null, notes: ['"2026-10-11 9:30" is in the past, saved as a draft'] });
  });

  it("flags a bad time, a media cell that isn't a link, a time with no date and a dated post with no text", () => {
    expect(by("G")).toMatchObject({ date: "2026-10-21", time: null, media: "" });
    expect(by("G").notes).toEqual(['"25:00" isn\'t a time (use 9:30 or 9:30pm), saved without one', '"photo.jpg" isn\'t a web link, left out']);
    expect(by("H")).toMatchObject({ date: null, time: null, notes: ['"8pm" has no date, saved without a time'] });
    expect(by("I").notes).toEqual(["No post text yet"]);
  });

  it("lists a row with no hook or text as left out, and doesn't count it against the room", () => {
    const left = plan.rows.find((r) => r.row === 10)!;
    expect(left).toMatchObject({ skip: "No hook or text, left out", fits: false });
    expect(planImport("hook,text,platform\n,,linkedin\nA,a,\nB,b,", "linkedin", 2, NOW).rows.map((r) => r.fits)).toEqual([false, true, true]);
  });

  it("moves a time clear of a post already scheduled in My posts, but not of one already posted", () => {
    const one = "hook,text,platform,date,time\nX,Body,linkedin,2026-10-20,09:10";
    const booked = [{ platform: "linkedin", scheduledFor: "2026-10-20T09:00", status: "scheduled" as const }];
    expect(planImport(one, "linkedin", 5, NOW, booked).rows[0]).toMatchObject({
      time: "09:40",
      notes: ["Moved from 9:10am to 9:40am, a post in My posts is on LinkedIn at 9am"],
    });
    expect(planImport(one, "linkedin", 5, NOW, [{ ...booked[0], status: "posted" as const }]).rows[0].notes).toEqual([]);
  });

  it("keeps the time and says so when no later half hour is free that day", () => {
    const late = "hook,text,platform,date,time\nX,Body,linkedin,2026-10-20,23:50";
    const booked = [{ platform: "linkedin", scheduledFor: "2026-10-20T23:45", status: "scheduled" as const }];
    expect(planImport(late, "linkedin", 5, NOW, booked).rows[0]).toMatchObject({
      time: "23:50",
      notes: ["Clashes with a post in My posts on LinkedIn at 11:45pm, and nothing later that day is free"],
    });
  });

  it("reads loosely named headers for the new columns, and a time inside the date cell", () => {
    const { rows } = planImport(
      "Topic,Caption,Channel,Scheduled date,Scheduled time,Image link,Tags\nT,Body,ig,2026-10-20,6:30 PM,https://x.co/p.png,#cpf\nU,Body,ig,20/10/2026 7:30 PM,,,",
      "linkedin",
      5,
      NOW,
    );
    expect(rows.map((r) => [r.platform, r.date, r.time, r.media, r.text])).toEqual([
      ["instagram", "2026-10-20", "18:30", "https://x.co/p.png", "Body\n\n#cpf"],
      ["instagram", "2026-10-20", "19:30", "", "Body"],
    ]);
    expect(planImport("hook,date\nV,20 Oct 2026", "linkedin", 5, NOW).rows[0].notes).toEqual([
      '"20 Oct 2026" isn\'t a date (use YYYY-MM-DD), saved without one',
    ]);
  });

  it("reads a Date/Time column as the date with its time, not as a time", () => {
    const { rows } = planImport("Hook,Text,Date/Time\nA,Body a,2026-10-20 18:30\nB,Body b,2026-10-21 9am", "linkedin", 5, NOW);
    expect(rows.map((r) => [r.date, r.time, r.notes])).toEqual([["2026-10-20", "18:30", []], ["2026-10-21", "09:00", []]]);
  });

  it("keeps a first row that names LinkedIn as a post, not a header", () => {
    const { rows } = planImport("3 ideas for your CPF,My post about it,linkedin\nSecond hook,Body,ig", "facebook", 5, NOW);
    expect(rows.map((r) => [r.hook, r.platform])).toEqual([["3 ideas for your CPF", "linkedin"], ["Second hook", "instagram"]]);
  });

  it("takes the caption from Caption when the sheet also has Content type and Status columns", () => {
    const { rows } = planImport("Hook,Content type,Caption,Status\nCPF at 55,Carousel,The real caption,Draft", "linkedin", 5, NOW);
    expect(rows.map((r) => [r.row, r.hook, r.text])).toEqual([[1, "CPF at 55", "The real caption"]]);
  });

  it("takes time, media and hashtags as columns five to seven when there is no header", () => {
    const { rows } = planImport("Hook,Body,linkedin,2026-10-20,8:00,https://x.co/v.mp4,cpf", "linkedin", 5, NOW);
    expect(rows[0]).toMatchObject({ time: "08:00", media: "https://x.co/v.mp4", text: "Body\n\n#cpf" });
  });

  it("saves the time into the schedule and the media link on the post", () => {
    const drafts = importDrafts(plan, Date.parse("2026-10-11T00:00:00Z"));
    expect(drafts.map((d) => [d.hook, d.scheduledFor ?? null, d.media ?? null])).toEqual([
      ["A", "2026-10-20T09:00", "https://drive.google.com/a.jpg"],
      ["B", "2026-10-20T09:30", null],
      ["C", "2026-10-20T10:15", null],
      ["D", "2026-10-20T09:00", null],
      ["E", null, null],
      ["F", null, null],
      ["G", "2026-10-21", null],
      ["H", null, null],
      ["I", "2026-10-22", null],
    ]);
  });
});
