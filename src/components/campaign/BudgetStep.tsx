// The campaign wizard's Where it runs and Budget steps (plan-campaign, Leo only). Where it runs is Fastlane's three
// choices; an ads option adds Budget: the daily budget in US$ (US$25 to US$100,000, its error under the field), the
// page the ads send people to (the brand's website until typed), up to 10 countries picked by name, and ages 18 to 65.
// Ads only has no Format and pace step, so its length is here. The wizard page draws the header, Back and Confirm.

import { useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ROW, dot, rowOn } from "@/components/campaign/WhoStep";
import { WeeksStepper } from "@/components/campaign/PaceStep";
import type { CampaignRuns } from "@/lib/campaigns";
import { budgetProblems, countryList, countryName, matchCountry, MAX_COUNTRIES, MAX_AGE, MIN_AGE, RUNS, type BudgetWork } from "@/lib/campaignWizard";

const HEAD = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";

export function RunsStep({ runs, onRuns }: { runs: CampaignRuns; onRuns: (r: CampaignRuns) => void }) {
  return (
    <div role="radiogroup" aria-labelledby="wizard-q" className="grid gap-1.5">
      {RUNS.map((r) => (
        <button key={r.id} type="button" role="radio" aria-checked={runs === r.id} onClick={() => onRuns(r.id)} className={`${ROW} ${rowOn(runs === r.id)}`}>
          <span aria-hidden className={dot(runs === r.id)} />
          <span className="min-w-0">
            <span className="block font-medium">{r.label}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{r.line}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function Field({ id, label, hint, error, children }: { id?: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      {id ? <label htmlFor={id} className={HEAD}>{label}</label> : <p className={HEAD}>{label}</p>}
      {children}
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function BudgetStep({ budget, onBudget, website, weeks, onWeeks }: {
  budget: BudgetWork;
  onBudget: (b: BudgetWork) => void;
  /** The brand's website, the landing page until one is typed. */
  website: string;
  /** Ads only: the run's length lives here. */
  weeks?: number;
  onWeeks?: (n: number) => void;
}) {
  const set = (patch: Partial<BudgetWork>) => onBudget({ ...budget, ...patch });
  const problems = budgetProblems(budget, website);
  const [typed, setTyped] = useState("");
  const all = useMemo(countryList, []);
  const full = budget.countries.length >= MAX_COUNTRIES;
  const add = (text: string) => {
    const code = matchCountry(text);
    if (!code) return false;
    if (!budget.countries.includes(code) && !full) set({ countries: [...budget.countries, code] });
    setTyped("");
    return true;
  };

  return (
    <div className="space-y-5">
      <Field id="ad-daily" label="Daily budget (US$)" hint="At least US$25 a day." error={problems.daily}>
        <Input id="ad-daily" inputMode="decimal" autoComplete="off" placeholder="50" value={budget.daily} aria-invalid={!!problems.daily}
          className="max-w-[12rem]" onChange={(e) => set({ daily: e.target.value })} />
      </Field>

      <Field id="ad-url" label="Where the ads send people" hint="An https address on your own site." error={problems.url}>
        <Input id="ad-url" inputMode="url" autoComplete="url" placeholder="https://yoursite.com" value={budget.url ?? website} aria-invalid={!!problems.url}
          onChange={(e) => set({ url: e.target.value })} />
      </Field>

      <Field id="ad-country" label="Countries" hint={full ? `${MAX_COUNTRIES} is the most.` : `Type a country's name and pick it. Up to ${MAX_COUNTRIES}.`} error={problems.countries}>
        {budget.countries.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {budget.countries.map((c) => (
              <li key={c} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border/70 bg-muted/40 pl-3 text-sm">
                {countryName(c)}
                <button type="button" aria-label={`Remove ${countryName(c)}`} onClick={() => set({ countries: budget.countries.filter((x) => x !== c) })}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Input id="ad-country" list="ad-country-list" autoComplete="off" placeholder="Type a country's name" value={typed} disabled={full}
          onChange={(e) => {
            // a pick from the list adds it; typing never does, or "Niger" would land before "Nigeria" is typed
            const kind = (e.nativeEvent as InputEvent).inputType;
            if ((!kind || kind === "insertReplacementText") && add(e.target.value)) return;
            setTyped(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            // Enter takes the first country whose name starts with what is typed
            const t = typed.trim().toLowerCase();
            const first = t && all.find((c) => c.name.toLowerCase().startsWith(t));
            if (first) add(first.name);
          }} />
        <datalist id="ad-country-list">
          {all.filter((c) => !budget.countries.includes(c.code)).map((c) => <option key={c.code} value={c.name} />)}
        </datalist>
      </Field>

      <Field label="Ages" error={problems.ages}>
        <div className="flex items-center gap-2" role="group" aria-label="Ages">
          <Input aria-label="Youngest" inputMode="numeric" className="w-20" value={budget.ageMin} min={MIN_AGE} max={MAX_AGE} onChange={(e) => set({ ageMin: e.target.value })} />
          <span className="text-sm text-muted-foreground">to</span>
          <Input aria-label="Oldest" inputMode="numeric" className="w-20" value={budget.ageMax} min={MIN_AGE} max={MAX_AGE} onChange={(e) => set({ ageMax: e.target.value })} />
        </div>
      </Field>

      {weeks !== undefined && onWeeks && <WeeksStepper weeks={weeks} onWeeks={onWeeks} label="How long the ads run" />}
    </div>
  );
}
