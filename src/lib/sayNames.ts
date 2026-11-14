// How the brand's names are said (Brand > Profile, carousel.ts `say`): every call to text-to-speech gets each name
// respelt as the brand wrote it, and word times that come back are put back to the name, so captions and words on
// screen always show the name as it is written. Matching only, no judgment.

export type SayName = { name: string; say: string };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const flat = (s: string) => s.replace(/\s+/g, " ").trim();
/** The names with a respelling that differs from the name itself. */
const respelt = (names: readonly SayName[] | undefined) => (names ?? []).filter((n) => flat(n.name) && flat(n.say) && flat(n.say).toLowerCase() !== flat(n.name).toLowerCase());

/** The words to speak: each name, as a whole word in any case, swapped for its respelling. */
export function sayNames(text: string, names: readonly SayName[] | undefined): string {
  const list = respelt(names).sort((a, b) => flat(b.name).length - flat(a.name).length);
  if (!list.length || !text) return text;
  const by = new Map(list.map((n) => [flat(n.name).toLowerCase(), flat(n.say)]));
  const alts = list.map((n) => flat(n.name).split(" ").map(esc).join("\\s+")).join("|");
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, "giu"), (m) => by.get(flat(m).toLowerCase()) ?? m);
}

const bare = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** Word times from a voice that was given sayNames' words, with each respelling put back to its name (one word). */
export function unsayWords<T extends { w: string; s: number; e: number }>(words: T[], names: readonly SayName[] | undefined): T[] {
  const list = respelt(names).map((n) => ({ name: flat(n.name), parts: flat(n.say).split(" ").map(bare).filter(Boolean) })).filter((n) => n.parts.length);
  if (!list.length) return words;
  const out: T[] = [];
  for (let i = 0; i < words.length; ) {
    let hit: (typeof list)[number] | undefined;
    let n = 0;
    for (const x of list) {
      if (x.parts.every((p, k) => words[i + k] && bare(words[i + k].w) === p)) [hit, n] = [x, x.parts.length];
      // a voice may give back a respelling with no spaces in it (Post-MOH-sis) as one word
      else if (bare(words[i].w) === x.parts.join("")) [hit, n] = [x, 1];
      if (hit) break;
    }
    if (!hit) {
      out.push(words[i++]);
      continue;
    }
    const first = words[i];
    const last = words[i + n - 1];
    const lead = first.w.match(/^[^\p{L}\p{N}]*/u)?.[0] ?? "";
    const tail = last.w.match(/[^\p{L}\p{N}]*$/u)?.[0] ?? "";
    out.push({ ...first, w: `${lead}${hit.name}${tail}`, e: last.e });
    i += n;
  }
  return out;
}
