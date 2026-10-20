// The copy check after a remix is written (docs/north-star/items/remix-closeness.md): runs of words the result
// shares with the original, and the original's figures, names and claims that came back. Counting and matching
// only, no judgment (Jev judges claims in other words). Pure, no imports: the app reads it too (remix-compare).

interface Word {
  /** As written, for showing the run. */
  shown: string;
  /** Lowercase, punctuation stripped, for matching. */
  key: string;
}

/** The words of a text, #hashtags and @handles left out. */
function words(text: string): Word[] {
  return String(text ?? "")
    .split(/\s+/)
    .filter((w) => w && !/^[#@]/.test(w))
    .map((w) => ({ shown: w.replace(/^[^\p{L}\p{N}$]+|[^\p{L}\p{N}%]+$/gu, ""), key: w.toLowerCase().replace(/[^\p{L}\p{N}$%]/gu, "") }))
    .filter((w) => w.key);
}

/** Runs of at least `min` words that appear in both texts (as written in `a`), longest first, each once. */
export function sharedRuns(a: string, b: string, min = 6): string[] {
  const x = words(a);
  const y = words(b);
  const runs = new Map<string, string>();
  // row[j]: length of the common run ending at x[i - 1] and y[j - 1]; one row kept at a time
  let prev = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    const row = new Array<number>(y.length + 1).fill(0);
    for (let j = 1; j <= y.length; j++) if (x[i - 1].key === y[j - 1].key) row[j] = prev[j - 1] + 1;
    for (let j = 1; j <= y.length; j++) {
      const n = row[j];
      // a run counts once it is whole: it can't go one word further
      if (n < min || (i < x.length && j < y.length && x[i].key === y[j].key)) continue;
      const run = x.slice(i - n, i).map((w) => w.shown).join(" ");
      runs.set(run.toLowerCase(), run);
    }
    prev = row;
  }
  return [...runs.values()].sort((p, q) => q.split(" ").length - p.split(" ").length);
}

/** A figure as bare digits: "$12,000" and "12000" are the same number. */
const digits = (t: string) => t.replace(/[^\d.]/g, "").replace(/\.$/, "");
const NUMBER = /\d[\d,.]*\d|\d/g;
/** "$12,000", "S$1.5", "SGD 300", "5%": digits with no letters once a currency word is off. */
const isFigure = (t: string) => /\d/.test(t) && !/\p{L}/u.test(t.replace(/^(?:S|SGD|USD)\s?/i, ""));
const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The dontReuse items found in the text: words case-insensitively, figures with or without separators. */
export function reusedItems(text: string, items: string[]): string[] {
  const t = String(text ?? "");
  const lower = t.toLowerCase();
  const figures = new Set((t.match(NUMBER) ?? []).map(digits));
  const out: string[] = [];
  for (const raw of items) {
    const item = String(raw ?? "").trim();
    if (!item || out.includes(item)) continue;
    const hit = isFigure(item)
      ? figures.has(digits(item))
      : new RegExp(`(^|[^\\p{L}\\p{N}])${escape(item.toLowerCase())}($|[^\\p{L}\\p{N}])`, "u").test(lower);
    if (hit) out.push(item);
  }
  return out;
}

/**
 * The original's money and figures, so none comes back even with no teardown: amounts, percentages and numbers
 * of 100 or more. Small counts ("5 signs") and years stay usable, since a remix may keep the number of points.
 */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of String(text ?? "").matchAll(/(?:S?\$|SGD\s?|USD\s?)?\d[\d,.]*\d%?|(?:S?\$)?\d%?/g)) {
    const token = m[0].replace(/[.,]+$/, "");
    const bare = digits(token);
    const money = /[$%]|SGD|USD/.test(token);
    const year = /^(19|20)\d\d$/.test(bare);
    if ((money || Number(bare) >= 100 || bare.includes(".")) && !year && !out.includes(token)) out.push(token);
  }
  return out;
}
