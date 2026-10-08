// Bulk import of post ideas or drafts from a CSV file (gap s12).
// Columns: hook (or topic), text, platform, date (YYYY-MM-DD; Excel's
// day-first 12/10/2026 is read too). A header row is optional: without one the
// columns are taken in that order. Nothing is saved here; the page previews
// planImport's rows and saves them on confirm.

import { newDraftId, type DraftEntry } from "@/lib/draftHistory";
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

export interface ImportRow {
  /** Row number among the file's posts (header and blank lines left out), for the preview. */
  row: number;
  hook: string;
  text: string;
  platform: PlanPlatform;
  date: string | null;
  notes: string[];
  /** False once My posts has no room left for it. */
  fits: boolean;
}

export interface ImportPlan {
  rows: ImportRow[];
  /** Rows past MAX_IMPORT_ROWS that were not read. */
  skipped: number;
}

/** Which column a header names, read loosely ("Hook / topic", "Post text", "Scheduled date"). */
function columnOf(h: string): "hook" | "text" | "platform" | "date" | undefined {
  const s = h.trim().toLowerCase();
  if (/date|when|schedul/.test(s)) return "date";
  if (/platform|channel|network/.test(s)) return "platform";
  if (/hook|topic|idea|title|headline/.test(s)) return "hook";
  if (/text|body|caption|copy|post|draft|content/.test(s)) return "text";
  return undefined;
}

/** What a CSV would import: one row per post, with any problem in plain words. `room` is how many more posts My posts can hold. */
export function planImport(text: string, defaultPlatform: PlanPlatform, room: number): ImportPlan {
  const all = parseCsv(text);
  const header = all[0]?.map(columnOf);
  // A header row names a column in every filled cell, one of them the post itself.
  const hasHeader =
    !!header && (header.includes("hook") || header.includes("text")) && all[0].every((h, i) => !h.trim() || header[i]);
  const cols = hasHeader ? header! : (["hook", "text", "platform", "date"] as const);
  const body = hasHeader ? all.slice(1) : all;
  const at = (r: string[], key: string) => {
    const i = cols.indexOf(key as never);
    return i >= 0 ? (r[i] ?? "").trim() : "";
  };
  const rows: ImportRow[] = [];
  body.slice(0, MAX_IMPORT_ROWS).forEach((r, i) => {
    const hook = at(r, "hook");
    const postText = at(r, "text");
    if (!hook && !postText) return;
    const notes: string[] = [];
    const rawPlatform = at(r, "platform");
    let platform = PLATFORM_ALIASES[rawPlatform.toLowerCase()];
    if (!platform) {
      platform = defaultPlatform;
      if (rawPlatform) notes.push(`Unknown platform "${rawPlatform}", using ${PLATFORM_NAME[defaultPlatform]}`);
    }
    const rawDate = at(r, "date");
    const date = rawDate ? parseDay(rawDate) : null;
    if (rawDate && !date) notes.push(`"${rawDate}" isn't a date (use YYYY-MM-DD), saved without one`);
    rows.push({ row: i + 1, hook, text: postText, platform, date, notes, fits: rows.length < room });
  });
  return { rows, skipped: Math.max(0, body.length - MAX_IMPORT_ROWS) };
}

/** The drafts a plan saves: rows that fit, scheduled when they have a date. */
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
      ...(r.date ? { scheduledFor: r.date } : {}),
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
    "hook,text,platform,date",
    `3 CPF moves to make before 55,"Most people only look at their CPF at 55. Here are three things to check now, while you still have time to act.",linkedin,${inDays(3)}`,
    `Why I tell clients to buy term first,,instagram,${inDays(5)}`,
    `"A question I get every week: ""Is an ILP worth it?""","Short answer: it depends.\nLong answer below.",facebook,`,
    "What a hospital bill looks like with and without a rider,,,",
  ].join("\r\n");
}
