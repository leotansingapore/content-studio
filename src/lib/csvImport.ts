// Bulk import of post ideas or drafts from a CSV file (gap s12, social gap g6).
// Columns: hook (or topic), text, platform, date (YYYY-MM-DD; Excel's
// day-first 12/10/2026 is read too), time (9:30, 21:30 or 9:30pm), media (a
// link) and hashtags. A header row is optional: without one the columns are
// taken in that order. Nothing is saved here; the page previews planImport's
// rows, each with its problems, and saves them on confirm. Past dates are
// flagged, never bumped; clashing times on one platform move 30 minutes apart.
// Validate-first and collision shifting ported from kevinbadi/social-agents@7f9e1ce (MIT).

import { draftStatus, newDraftId, type DraftEntry } from "@/lib/draftHistory";
import { localDateKey, scheduleAt, scheduleTime, timeLabel } from "@/lib/dueDates";
import type { PlanPlatform } from "@/lib/positioning";

export const MAX_IMPORT_ROWS = 200;

/** RFC 4180 CSV: quoted fields may hold commas, quotes ("") and line breaks; BOM, CRLF and CR are fine. */
export function parseCsv(text: string): string[][] {
  // One line ending everywhere, inside quoted fields too.
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Blank lines carry no post.
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const PLATFORM_ALIASES: Record<string, PlanPlatform> = {
  linkedin: "linkedin",
  li: "linkedin",
  instagram: "instagram",
  ig: "instagram",
  insta: "instagram",
  facebook: "facebook",
  fb: "facebook",
  tiktok: "tiktok",
  "tik tok": "tiktok",
};
export const PLATFORM_NAME: Record<PlanPlatform, string> = { linkedin: "LinkedIn", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };

/** A real calendar day as YYYY-MM-DD, from YYYY-MM-DD or day-first D/M/YYYY; null otherwise. */
export function parseDay(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (hit) [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else if ((hit = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) [d, m, y] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "HH:MM" (24 hour) from 9:30, 21:30, 09:30:00, 9am or 9.30 PM; null otherwise. A bare "9" could be either half of the day. */
export function parseTime(raw: string): string | null {
  const hit = /^(\d{1,2})(?:[:.](\d{2})(?::\d{2})?)?\s*(?:([ap])\.?m\.?)?$/i.exec(raw.trim());
  if (!hit || (!hit[2] && !hit[3])) return null;
  let h = Number(hit[1]);
  const m = Number(hit[2] ?? 0);
  if (m > 59) return null;
  if (hit[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (hit[3].toLowerCase() === "p" ? 12 : 0);
  } else if (h > 23) return null;
  return `${pad(h)}:${pad(m)}`;
}

const TAG_WORD = /[\p{L}\p{N}_]+/gu;

/** The hashtags cell as one "#a #b" line, leaving out tags the post already has. */
export function hashtagLine(cell: string, text: string): string {
  const have = new Set((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.slice(1).toLowerCase()));
  const tags: string[] = [];
  for (const w of cell.match(TAG_WORD) ?? []) {
    if (have.has(w.toLowerCase())) continue;
    have.add(w.toLowerCase());
    tags.push(`#${w}`);
  }
  return tags.join(" ");
}

export interface ImportRow {
  /** Row number among the file's posts (header and blank lines left out), for the preview. */
  row: number;
  hook: string;
  /** The post text, with the hashtags column on its last line. */
  text: string;
  platform: PlanPlatform;
  date: string | null;
  /** Local "HH:MM", only with a date. */
  time: string | null;
  /** An http(s) link to the photo or video, or "". */
  media: string;
  notes: string[];
  /** Why the row isn't imported at all. */
  skip?: string;
  /** False when skipped or once My posts has no room left for it. */
  fits: boolean;
}

export interface ImportPlan {
  rows: ImportRow[];
  /** Rows past MAX_IMPORT_ROWS that were not read. */
  skipped: number;
}

type Column = "hook" | "text" | "platform" | "date" | "time" | "media" | "hashtags";
const HEADERLESS: Column[] = ["hook", "text", "platform", "date", "time", "media", "hashtags"];

/** Which column a header names, read loosely ("Hook / topic", "Post text", "Scheduled date", "Image link"). */
function columnOf(h: string): Column | undefined {
  const s = h.trim().toLowerCase();
  // Time before date, so "Scheduled time" isn't read as the date; "Date/Time" is the date, with its time.
  if (/\btime\b|hour/.test(s) && !/date/.test(s)) return "time";
  if (/date|when|schedul/.test(s)) return "date";
  if (/platform|channel|network/.test(s)) return "platform";
  if (/hashtag|\btags?\b/.test(s)) return "hashtags";
  if (/media|image|photo|picture|video|asset|link|url|file/.test(s)) return "media";
  if (/hook|topic|idea|title|headline/.test(s)) return "hook";
  if (/text|body|caption|copy|post|draft|content/.test(s)) return "text";
  return undefined;
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const DAY_MINUTES = 24 * 60;
const CLASH_MINUTES = 30;

/** Scheduled posts already in My posts, for clash checks. */
type Booked = Pick<DraftEntry, "platform" | "scheduledFor" | "status">;

/**
 * What a CSV would import: one row per post, with every problem in plain words.
 * `room` is how many more posts My posts can hold; `now` decides what is in the
 * past; `booked` are the posts already scheduled, which imported times move clear of.
 */
export function planImport(
  text: string,
  defaultPlatform: PlanPlatform,
  room: number,
  now: Date = new Date(),
  booked: Booked[] = [],
): ImportPlan {
  const all = parseCsv(text);
  const header = all[0]?.map(columnOf);
  // A header row names a column in every filled cell, one of them the post itself.
  const hasHeader =
    !!header && (header.includes("hook") || header.includes("text")) && all[0].every((h, i) => !h.trim() || header[i]);
  const cols = hasHeader ? header! : HEADERLESS;
  const body = hasHeader ? all.slice(1) : all;
  const at = (r: string[], key: Column) => {
    const i = cols.indexOf(key);
    return i >= 0 ? (r[i] ?? "").trim() : "";
  };
  const today = localDateKey(now);
  const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const rows: ImportRow[] = [];
  let kept = 0;
  body.slice(0, MAX_IMPORT_ROWS).forEach((r, i) => {
    const hook = at(r, "hook");
    const postText = at(r, "text");
    const base = { row: i + 1, hook, platform: defaultPlatform, date: null, time: null, media: "" };
    if (!hook && !postText) {
      rows.push({ ...base, text: "", notes: [], skip: "No hook or text, left out", fits: false });
      return;
    }
    const notes: string[] = [];
    const rawPlatform = at(r, "platform");
    let platform = PLATFORM_ALIASES[rawPlatform.toLowerCase()];
    if (!platform) {
      platform = defaultPlatform;
      if (rawPlatform) notes.push(`Unknown platform "${rawPlatform}", using ${PLATFORM_NAME[defaultPlatform]}`);
    }
    // A spreadsheet's date and time cell ("2026-10-20 18:30") carries both.
    const dateCell = at(r, "date");
    const [dayPart, afterDay = ""] = dateCell.split(/[ T](.+)/);
    const timeInDate = parseTime(afterDay) ? afterDay : "";
    const rawDate = timeInDate ? dayPart : dateCell;
    const rawTime = at(r, "time") || timeInDate;
    let date = rawDate ? parseDay(rawDate) : null;
    if (rawDate && !date) notes.push(`"${rawDate}" isn't a date (use YYYY-MM-DD), saved without one`);
    let time = rawTime ? parseTime(rawTime) : null;
    if (rawTime && !time) notes.push(`"${rawTime}" isn't a time (use 9:30 or 9:30pm), saved without one`);
    else if (time && !rawDate) notes.push(`"${rawTime}" has no date, saved without a time`);
    if (date && (date < today || (date === today && time !== null && time <= nowTime))) {
      const pastBecause = date === today ? `${rawDate} ${rawTime}` : rawDate;
      notes.push(`"${pastBecause}" is in the past, saved as a draft`);
      date = null;
    }
    if (!date) time = null;
    const rawMedia = at(r, "media");
    const media = /^https?:\/\/\S+$/i.test(rawMedia) ? rawMedia : "";
    if (rawMedia && !media) notes.push(`"${rawMedia}" isn't a web link, left out`);
    if (date && !postText) notes.push("No post text yet");
    const tags = hashtagLine(at(r, "hashtags"), postText);
    const fullText = tags ? (postText ? `${postText}\n\n${tags}` : tags) : postText;
    rows.push({ ...base, text: fullText, platform, date, time, media, notes, fits: kept++ < room });
  });

  // Clashes: on one platform and day, an imported time moves later in 30 minute
  // steps until it is 30 minutes clear of the posts before it in the file and
  // of those already scheduled. Earlier rows keep their times.
  const taken = new Map<string, { min: number; who: string }[]>();
  const slotsOf = (platform: string, day: string) => {
    const key = `${platform}|${day}`;
    if (!taken.has(key)) taken.set(key, []);
    return taken.get(key)!;
  };
  for (const d of booked) {
    const t = scheduleTime(d.scheduledFor);
    if (t && draftStatus(d as DraftEntry) !== "posted") {
      slotsOf(d.platform, d.scheduledFor!.slice(0, 10)).push({ min: toMinutes(t), who: "a post in My posts" });
    }
  }
  for (const r of rows) {
    if (!r.fits || !r.date || !r.time) continue;
    const slots = slotsOf(r.platform, r.date);
    const clash = (min: number) => slots.find((s) => Math.abs(s.min - min) < CLASH_MINUTES);
    let min = toMinutes(r.time);
    const first = clash(min);
    if (first) {
      while (min < DAY_MINUTES && clash(min)) min += CLASH_MINUTES;
      const where = `${PLATFORM_NAME[r.platform]} at ${timeLabel(hhmm(first.min))}`;
      if (min < DAY_MINUTES) {
        r.notes.push(`Moved from ${timeLabel(r.time)} to ${timeLabel(hhmm(min))}, ${first.who} is on ${where}`);
        r.time = hhmm(min);
      } else r.notes.push(`Clashes with ${first.who} on ${where}, and nothing later that day is free`);
    }
    slots.push({ min: toMinutes(r.time), who: `row ${r.row}` });
  }
  return { rows, skipped: Math.max(0, body.length - MAX_IMPORT_ROWS) };
}

const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** The drafts a plan saves: rows that fit, scheduled (at their time, if any) when they have a date. */
export function importDrafts(plan: ImportPlan, now = Date.now()): DraftEntry[] {
  return plan.rows
    .filter((r) => r.fits)
    .map((r, i) => ({
      id: newDraftId(),
      // A millisecond apart so the file's order survives newest-first sorting.
      createdAt: new Date(now - i).toISOString(),
      hook: r.hook,
      draft: r.text,
      pillar: "",
      pillarDetail: "",
      audience: "",
      format: "",
      platform: r.platform,
      ctaType: "",
      status: r.date ? "scheduled" : "draft",
      ...(r.date ? { scheduledFor: scheduleAt(r.date, r.time) } : {}),
      ...(r.media ? { media: r.media } : {}),
    }));
}

/** A sample file to fill in, dated from `today`. */
export function exampleCsv(today: string): string {
  const inDays = (n: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  return [
    "hook,text,platform,date,time,media,hashtags",
    `3 CPF moves to make before 55,"Most people only look at their CPF at 55. Here are three things to check now, while you still have time to act.",linkedin,${inDays(3)},8:30am,,cpf retirement`,
    `Why I tell clients to buy term first,"Term first, then invest the difference. Here is how the numbers work out.",instagram,${inDays(5)},19:30,,`,
    `"A question I get every week: ""Is an ILP worth it?""","Short answer: it depends.\nLong answer below.",facebook,,,,`,
    "What a hospital bill looks like with and without a rider,,,,,,",
  ].join("\r\n");
}
