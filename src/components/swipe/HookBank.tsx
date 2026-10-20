// Hooks (/swipe?tab=hooks, Leo only; docs/north-star/items/remix-patterns.md part B): the 21 hook formulas with the
// real opening lines that used them, from the weekly drop and your Following. ?q=, ?formula= and ?why= live in the URL;
// "Use this hook" opens Write on the formula.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, PenLine, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeExternalUrl } from "@/lib/embed";
import { loadFollowing, onFollowing } from "@/lib/following";
import { HOOK_BANK, type HookLine, WHY, followingLines, hookCards, whyLabel } from "@/lib/hookBank";
import { HOOK_FORMULAS } from "@/lib/hookFormulas";
import { links } from "@/lib/links";
import { loadPatterns, onPatternsChanged } from "@/lib/patterns";
import { useUrlSearch, useUrlState, useUrlUpdate } from "@/lib/urlState";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
/** Lines a card shows before "See all": picking its formula shows them all. */
const FIRST = 3;

function Pick({ label, value, onChange, options }: { label: string; value: string; onChange(v: string): void; options: [string, string][] }) {
  return (
    <label className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 text-xs sm:h-8 [@media(pointer:coarse)]:h-11">
      <span className="font-semibold text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="h-full max-w-[10rem] bg-transparent font-medium text-foreground outline-none">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

export default function HookBank({ userId }: { userId: string }) {
  const [version, bump] = useState(0);
  useEffect(() => {
    const again = () => bump((v) => v + 1);
    const offs = [onPatternsChanged(again), onFollowing(again)];
    return () => offs.forEach((off) => off());
  }, []);
  const [text, setText, q] = useUrlSearch("q");
  const [formula, setFormula] = useUrlState<string>("formula", "all", { allowed: ["all", ...HOOK_FORMULAS.map((f) => f.id)] });
  const [why, setWhy] = useUrlState<string>("why", "all", { allowed: ["all", ...WHY.map((w) => w.id)] });
  const update = useUrlUpdate();

  const lines = useMemo(() => [...HOOK_BANK.hooks, ...followingLines(loadFollowing(userId), loadPatterns(userId))], [userId, version]);
  const cards = hookCards(lines, { formula, why, q });
  const clear = () => {
    setText("");
    update({ q: null, formula: null, why: null });
  };

  return (
    <section className="space-y-4" aria-label="Hooks">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-auto sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search hooks" aria-label="Search hooks" className="pl-9 [@media(pointer:coarse)]:h-11" />
        </div>
        <Pick label="Formula" value={formula} onChange={setFormula} options={[["all", "All"], ...HOOK_FORMULAS.map((f): [string, string] => [f.id, f.name])]} />
        <Pick label="Why it works" value={why} onChange={setWhy} options={[["all", "All"], ...WHY.map((w): [string, string] => [w.id, w.label])]} />
      </div>
      {!HOOK_BANK.hooks.length && <p className="text-xs text-muted-foreground">Real opening lines from top posts arrive with the weekly drop.</p>}

      {cards.length === 0 ? (
        <div className="flex flex-col items-start gap-2 text-sm">
          <p>No hooks match. Clear the search to see all {HOOK_FORMULAS.length}.</p>
          <Button variant="outline" size="sm" className={`h-9 ${TOUCH}`} onClick={clear}>Clear</Button>
        </div>
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {cards.map((c) => {
            const shown = formula === "all" ? c.lines.slice(0, FIRST) : c.lines;
            return (
              <article key={c.formula.id} className="flex min-w-0 flex-col gap-2 rounded-xl border border-border/60 bg-card p-4 shadow-card">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <h3 className="font-semibold">{c.formula.name}</h3>
                  {c.why && <span className="text-xs text-muted-foreground">Why it works: {whyLabel(c.why)}</span>}
                </div>
                <p className="text-sm font-medium">{c.formula.template}</p>
                <p className="text-xs text-muted-foreground">Example: {c.formula.example}</p>
                {shown.length > 0 && (
                  <ul className="space-y-2 border-l-2 border-primary/30 pl-3">
                    {shown.map((l) => <Line key={l.id} line={l} />)}
                  </ul>
                )}
                {shown.length < c.lines.length && (
                  <button type="button" onClick={() => setFormula(c.formula.id)} className={`self-start text-xs font-medium text-primary hover:underline ${TOUCH}`}>
                    See all {c.lines.length}
                  </button>
                )}
                <p className="text-xs text-muted-foreground">Trap: {c.formula.trap}</p>
                <Button asChild size="sm" variant="outline" className={`mt-1 h-9 gap-1.5 self-start ${TOUCH}`}>
                  <Link to={links.generate({ formula: c.formula.id })}><PenLine className="h-3.5 w-3.5" aria-hidden /> Use this hook</Link>
                </Button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Line({ line: l }: { line: HookLine }) {
  const open = l.url ? safeExternalUrl(l.url) : null;
  return (
    <li className="space-y-0.5 text-xs">
      <p className="text-muted-foreground">
        Seen in {l.from}, {l.ratio}x their usual
        {l.following && <span className="ml-1.5 inline-block whitespace-nowrap rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">From your Following</span>}
      </p>
      <p>"{l.text}"</p>
      {open && (
        <a href={open} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 font-medium text-primary hover:underline ${TOUCH}`}>
          <ExternalLink className="h-3 w-3" aria-hidden /> Open post
        </a>
      )}
    </li>
  );
}
