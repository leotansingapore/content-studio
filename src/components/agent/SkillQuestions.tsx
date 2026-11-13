// A make skill's questions in the agent's thread (makeSkills.ts; Holo's question card, H3, with its wizard footer, H12):
// one question at a time as radio options, "Type your answer" where free words fit, Skip where it may be skipped, and
// "Step 1 of 3" with Back and Continue. What is answered sits above as a line each, tappable to go back. Answers and
// half-typed words wait on this device (saveFlow), and the step is in the address (?skill=<id>&step=2), so a reload
// resumes. The last Continue hands the answers to the page (onDone): the agent's priced card, or the maker beside the chat.

import { useEffect, useMemo, useState } from "react";
import { CircleNotchIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadFlow, questionsFor, saveFlow, stepOf, type Answers, type MakeSkill, type Question, type QuestionId } from "@/lib/makeSkills";
import { cn } from "@/lib/utils";

const SHOWN = 4;
const SHORT: Record<QuestionId, string> = { about: "About", product: "Product", angle: "Angle", presenter: "Who appears", length: "Length" };
/** The option a question starts on: the least used angle, the format's usual length; nothing else is picked for you. */
const preset = (q: Question, lengths: number[] | undefined): string => (q.id === "angle" ? (q.options[0]?.value ?? "") : q.id === "length" ? String(lengths?.includes(15) ? 15 : (lengths?.[0] ?? "")) : "");

export default function SkillQuestions({ userId, skill, asked, busy, error, onStep, onDone, onCancel }: {
  userId: string;
  skill: MakeSkill;
  /** The address's step, 1-based. */
  asked: number | null;
  /** The answers were handed on and the next thing is being made ready. */
  busy: boolean;
  error: string | null;
  onStep: (n: number) => void;
  onDone: (a: Answers) => void;
  onCancel: () => void;
}) {
  const qs = useMemo(() => questionsFor(skill, userId), [skill, userId]);
  const kept = loadFlow(userId);
  const [answers, setAnswers] = useState<Answers>(() => (kept?.skill === skill.id ? kept.answers : {}));
  const [typing, setTyping] = useState<Answers>(() => (kept?.skill === skill.id ? (kept.typing ?? {}) : {}));
  const n = stepOf(qs, answers, asked);
  const q = qs[n - 1] as Question | undefined;
  const [choice, setChoice] = useState("");
  // a long list (twelve angles) shows its first four, least used first, until More
  const [more, setMore] = useState(false);
  // a new step starts on its kept answer, else its preset
  useEffect(() => {
    if (!q) return;
    const had = answers[q.id];
    setChoice(had !== undefined && q.options.some((o) => o.value === had) ? had : had === undefined ? preset(q, skill.lengths) : "");
    setMore(false);
  }, [q?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const keep = (a: Answers, t: Answers) => saveFlow(userId, { skill: skill.id, answers: a, typing: t, at: new Date().toISOString() });
  const typed = q ? (typing[q.id] ?? (answers[q.id] && !q.options.some((o) => o.value === answers[q.id]) ? answers[q.id] : "")) : "";
  const value = (choice || (q?.typed ? typed.trim() : "")).trim();

  const answer = (v: string) => {
    if (!q) return;
    const next = { ...answers, [q.id]: v };
    const t = { ...typing };
    delete t[q.id];
    setAnswers(next);
    setTyping(t);
    keep(next, t);
    if (n >= qs.length) onDone(next);
    else onStep(n + 1);
  };
  const type = (v: string) => {
    if (!q) return;
    setChoice("");
    const t = { ...typing, [q.id]: v };
    setTyping(t);
    keep(answers, t);
  };

  const picked = qs.slice(0, Math.max(0, n - 1)).filter((x) => x.id in answers);
  const label = (x: Question) => {
    const v = answers[x.id] ?? "";
    return v ? (x.options.find((o) => o.value === v)?.label ?? v) : "Skipped";
  };

  return (
    <section aria-label={skill.name} className="w-full max-w-xl rounded-2xl border border-border bg-card p-4 shadow-card">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{skill.kind}</p>
          <h3 className="truncate text-base font-semibold text-foreground">{skill.name}</h3>
        </div>
        <button type="button" onClick={onCancel} aria-label={`Stop making ${skill.name}`} className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
          <XIcon className="h-4 w-4" />
        </button>
      </header>
      {picked.length > 0 && (
        <ul className="mt-2 space-y-0.5" aria-label="Your answers">
          {picked.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => onStep(qs.indexOf(x) + 1)} className="flex min-h-9 w-full items-baseline gap-2 rounded-lg px-1 text-left text-sm hover:bg-accent [@media(pointer:coarse)]:min-h-11">
                <span className="shrink-0 text-xs text-muted-foreground">{SHORT[x.id]}</span>
                <span className="min-w-0 truncate text-foreground">{label(x)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (value && !busy) answer(value);
          }}
        >
          <fieldset className="space-y-2">
            <legend className="pb-2 text-sm font-medium text-foreground">{q.ask}</legend>
            {q.options.length > 0 && (
              <div role="radiogroup" aria-label={q.ask} className={cn("grid gap-1.5", q.options.length > 4 && "sm:grid-cols-2")}>
                {(more || q.options.length <= SHOWN + 1 ? q.options : q.options.filter((o, i) => i < SHOWN || o.value === choice)).map((o) => (
                  <label
                    key={o.value}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors",
                      choice === o.value ? "border-primary bg-primary/5 text-foreground" : "border-border hover:border-primary/40",
                    )}
                  >
                    <input type="radio" name={`q-${q.id}`} value={o.value} checked={choice === o.value} onChange={() => setChoice(o.value)} className="h-4 w-4 shrink-0 accent-primary" />
                    <span className="min-w-0 break-words">{o.label}</span>
                  </label>
                ))}
              </div>
            )}
            {!more && q.options.length > SHOWN + 1 && (
              <button type="button" onClick={() => setMore(true)} className="min-h-9 text-sm font-medium text-primary hover:underline [@media(pointer:coarse)]:min-h-11">
                Show all {q.options.length}
              </button>
            )}
            {q.typed && (
              <Input
                value={typed}
                onChange={(e) => type(e.target.value)}
                onFocus={() => setChoice("")}
                maxLength={300}
                placeholder="Type your answer"
                aria-label={q.options.length ? "Type your answer" : q.ask}
                autoFocus={q.options.length === 0 && window.matchMedia?.("(pointer: fine)").matches}
                className="h-11 rounded-xl"
              />
            )}
          </fieldset>
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          <footer className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-xs tabular-nums text-muted-foreground">
              Step {n} of {qs.length}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {!q.required && (
                <Button type="button" variant="ghost" disabled={busy} onClick={() => answer("")} className="h-11 sm:h-9">
                  Skip
                </Button>
              )}
              {n > 1 && (
                <Button type="button" variant="outline" disabled={busy} onClick={() => onStep(n - 1)} className="h-11 sm:h-9">
                  Back
                </Button>
              )}
              <Button type="submit" disabled={!value || busy} className="h-11 gap-1.5 sm:h-9">
                {busy && <CircleNotchIcon className="h-4 w-4 animate-spin" />} Continue
              </Button>
            </div>
          </footer>
        </form>
      ) : (
        // every question answered (a reload after the last one): the answers above, and the one way on
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : (
            <span className="text-xs tabular-nums text-muted-foreground">{qs.length ? `Step ${qs.length} of ${qs.length}` : ""}</span>
          )}
          <Button type="button" disabled={busy} onClick={() => onDone(answers)} className="h-11 gap-1.5 sm:h-9">
            {busy && <CircleNotchIcon className="h-4 w-4 animate-spin" />} Continue
          </Button>
        </div>
      )}
    </section>
  );
}
