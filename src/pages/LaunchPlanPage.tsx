// Launch plan (/launch, Strategy): what launches, the date and the link, then a month of posts counting back from the
// date, grouped by week, each opening the maker that makes it with its words filled in (src/lib/launchPlan.ts).
// Folded from BuilderCult's Launch plan (owner's agreement, Leo 6 Nov 2026). For every sign-in; no AI on this page.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRightIcon, CheckIcon, PencilSimpleIcon, RocketLaunchIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  addDays,
  briefFor,
  cleanLink,
  daysBetween,
  groupOf,
  isDay,
  loadLaunch,
  localDay,
  makerLabel,
  makerUrl,
  MAX_THING,
  saveLaunch,
  stepDate,
  stepStates,
  STEPS,
  type LaunchPlan,
} from "@/lib/launchPlan";
import { ownBrandName } from "@/lib/remixBrand";
import { useSignedInUser } from "@/lib/useLeoOnly";
import NotFoundPage from "@/pages/NotFoundPage";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default function LaunchPlanPage() {
  const user = useSignedInUser();
  if (user === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!user) return <NotFoundPage notOnAccount />;
  return <Launch userId={user.id} />;
}

function Launch({ userId }: { userId: string }) {
  const [plan, setPlan] = useState<LaunchPlan | null>(() => loadLaunch(userId));
  const [editing, setEditing] = useState(!plan);
  const today = localDay();
  useEffect(() => {
    document.title = "Launch plan - Postmosis";
  }, []);
  const keep = (next: LaunchPlan | null) => {
    setPlan(next);
    saveLaunch(userId, next);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          <RocketLaunchIcon className="h-6 w-6 shrink-0 text-primary" aria-hidden /> Launch plan
        </h1>
      </header>
      {editing || !plan ? (
        <Setup
          userId={userId}
          plan={plan}
          today={today}
          onSave={(p) => (keep({ ...p, done: plan?.done ?? [] }), setEditing(false))}
          onCancel={plan ? () => setEditing(false) : undefined}
        />
      ) : (
        <Month plan={plan} today={today} onEdit={() => setEditing(true)} onToggle={(id) => keep({ ...plan, done: plan.done.includes(id) ? plan.done.filter((x) => x !== id) : [...plan.done, id] })} />
      )}
    </div>
  );
}

function Setup(p: { userId: string; plan: LaunchPlan | null; today: string; onSave: (plan: Omit<LaunchPlan, "done">) => void; onCancel?: () => void }) {
  const [thing, setThing] = useState(() => p.plan?.thing ?? ownBrandName(p.userId));
  const [date, setDate] = useState(() => p.plan?.date ?? addDays(p.today, 28));
  const [link, setLink] = useState(() => p.plan?.link ?? "");
  const badLink = link.trim() !== "" && !cleanLink(link);
  const ready = thing.trim().length > 0 && isDay(date) && !badLink;
  return (
    <Card className="border-border/60 shadow-card">
      <CardContent className="space-y-4 pt-6">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) p.onSave({ thing: thing.trim(), date, link: cleanLink(link) });
          }}
        >
          <label className="block space-y-1.5 text-sm font-medium">
            What are you launching?
            <Input value={thing} maxLength={MAX_THING} onChange={(e) => setThing(e.target.value)} placeholder="Your app, a workshop, a new service" className="font-normal" />
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            Launch date
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`w-48 font-normal ${TOUCH}`} />
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            Where should people go? <span className="font-normal text-muted-foreground">(optional)</span>
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="A waitlist, the App Store page, a sign-up form" inputMode="url" className="font-normal" />
          </label>
          {badLink && <p className="text-sm text-destructive" role="alert">That doesn't look like a web address.</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!ready}>
              {p.plan ? "Save" : "Lay out my month"}
            </Button>
            {p.onCancel && (
              <Button type="button" variant="ghost" onClick={p.onCancel}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Month({ plan, today, onEdit, onToggle }: { plan: LaunchPlan; today: string; onEdit: () => void; onToggle: (id: string) => void }) {
  const states = useMemo(() => stepStates(plan, today), [plan, today]);
  const made = plan.done.length;
  const left = daysBetween(today, plan.date);
  const groups = useMemo(() => [...new Set(STEPS.map(groupOf))].map((g) => ({ g, steps: STEPS.filter((s) => groupOf(s) === g) })), []);
  return (
    <div className="space-y-5">
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-lg font-semibold">{plan.thing} launches {dayLabel(plan.date)}</p>
              <p className="text-sm text-muted-foreground">
                {left > 1 ? `In ${left} days` : left === 1 ? "Tomorrow" : left === 0 ? "Today" : `${-left} days ago`}
                {plan.link && <>, posts send people to <a href={plan.link} target="_blank" rel="noreferrer" className="text-primary hover:underline">{new URL(plan.link).hostname}</a></>}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={onEdit} className={`gap-1.5 ${TOUCH}`}>
              <PencilSimpleIcon className="h-3.5 w-3.5" /> Change
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={made} aria-valuemin={0} aria-valuemax={STEPS.length} aria-label="Launch posts made">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(made / STEPS.length) * 100}%` }} />
            </div>
            <span className="text-xs font-semibold text-muted-foreground">{made} of {STEPS.length} made</span>
          </div>
          {made === STEPS.length && <p className="text-sm font-medium text-success">Every launch post is made.</p>}
        </CardContent>
      </Card>

      {groups.map(({ g, steps }) => (
        <section key={g} className="space-y-2" aria-label={g}>
          <h2 className="text-sm font-semibold text-muted-foreground">{g}</h2>
          {steps.map((s) => {
            const state = states[s.id];
            const lead = state === "next" || state === "today";
            return (
              <div key={s.id} className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center ${lead ? "border-primary/50 bg-card shadow-card" : "border-border/60"} ${state === "done" || state === "past" ? "opacity-70" : ""}`} data-step={s.id} data-state={state}>
                <button
                  type="button"
                  onClick={() => onToggle(s.id)}
                  aria-pressed={state === "done"}
                  aria-label={state === "done" ? `Mark ${s.stage} not made` : `Mark ${s.stage} made`}
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border ${state === "done" ? "border-success bg-success text-white" : "border-border"} ${TOUCH}`}
                >
                  {state === "done" && <CheckIcon className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {dayLabel(stepDate(plan, s))}
                    {state === "today" && " (today)"}
                    {state === "past" && " (missed)"}
                    {", "}{makerLabel(s)}
                  </p>
                  <p className="text-sm font-semibold">{s.stage}</p>
                  <p className="text-sm text-muted-foreground">{briefFor(plan, s)}</p>
                </div>
                {state !== "done" && (
                  <Button asChild size="sm" variant={lead ? "default" : "outline"} className={`shrink-0 gap-1.5 ${TOUCH}`}>
                    <Link to={makerUrl(plan, s)}>
                      Make it <ArrowRightIcon className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
