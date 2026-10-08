// Singapore dates advisers plan posts around, shown on the calendar.
//
// Public holidays: as gazetted by MOM, copied from
// https://www.mom.gov.sg/employment-practices/public-holidays (checked
// 2026-10-08; both 2026 and 2027 were published). A holiday on a Sunday makes
// the Monday a holiday too, listed here as "(observed)". Add 2028 when MOM
// publishes it.
//
// Money moments: things advisers post about that come round every year. Most
// move by a few days or weeks, so those carry `approx` and the calendar says so.
// The tax filing deadline is 18 April for e-filing and paper since YA 2025
// (iras.gov.sg, tax season 2026); the 31 December top-up cut-off is fixed.

export interface SgDate {
  date: string; // YYYY-MM-DD
  title: string;
  kind: "holiday" | "money";
  approx?: boolean;
}

const HOLIDAYS: [string, string][] = [
  ["2026-01-01", "New Year's Day"],
  ["2026-02-17", "Chinese New Year"],
  ["2026-02-18", "Chinese New Year"],
  ["2026-03-21", "Hari Raya Puasa"],
  ["2026-04-03", "Good Friday"],
  ["2026-05-01", "Labour Day"],
  ["2026-05-27", "Hari Raya Haji"],
  ["2026-05-31", "Vesak Day"],
  ["2026-06-01", "Vesak Day (observed)"],
  ["2026-08-09", "National Day"],
  ["2026-08-10", "National Day (observed)"],
  ["2026-11-08", "Deepavali"],
  ["2026-11-09", "Deepavali (observed)"],
  ["2026-12-25", "Christmas Day"],
  ["2027-01-01", "New Year's Day"],
  ["2027-02-06", "Chinese New Year"],
  ["2027-02-07", "Chinese New Year"],
  ["2027-02-08", "Chinese New Year (observed)"],
  ["2027-03-10", "Hari Raya Puasa"],
  ["2027-03-26", "Good Friday"],
  ["2027-05-01", "Labour Day"],
  ["2027-05-17", "Hari Raya Haji"],
  ["2027-05-20", "Vesak Day"],
  ["2027-08-09", "National Day"],
  ["2027-10-28", "Deepavali"],
  ["2027-12-25", "Christmas Day"],
];

// Month-day, title, approximate?
const MONEY: [string, string, boolean][] = [
  ["02-15", "Budget day", true],
  ["03-15", "CPF interest rates for Apr-Jun announced", true],
  ["04-18", "Income tax filing deadline", false],
  ["06-01", "Great Singapore Sale season starts", true],
  ["06-15", "CPF interest rates for Jul-Sep announced", true],
  ["06-15", "Mid-year bonus season", true],
  ["09-15", "CPF interest rates for Oct-Dec announced", true],
  ["12-01", "Year-end bonus season", true],
  ["12-15", "CPF interest rates for Jan-Mar announced", true],
  ["12-31", "Last day for CPF and SRS top-ups to count for tax relief", false],
];

/** Every public holiday and money moment between two day keys, inclusive, by day. */
export function sgDatesBetween(from: string, to: string): Map<string, SgDate[]> {
  const out = new Map<string, SgDate[]>();
  const add = (d: SgDate) => {
    if (d.date < from || d.date > to) return;
    out.set(d.date, [...(out.get(d.date) ?? []), d]);
  };
  for (const [date, title] of HOLIDAYS) add({ date, title, kind: "holiday" });
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const [md, title, approx] of MONEY) add({ date: `${y}-${md}`, title, kind: "money", approx });
  }
  return out;
}

/** "Budget day (approx.)" for a moving date, the title alone for a fixed one. */
export function sgDateLabel(d: SgDate): string {
  return d.approx ? `${d.title} (approx.)` : d.title;
}
