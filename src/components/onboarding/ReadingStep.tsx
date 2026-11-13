import { useEffect, useRef, useState } from "react";
import { CheckIcon, CircleNotchIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Actions, PrimaryPill, QuietPill, StepTitle } from "@/components/onboarding/parts";
import { firstOpenQuestion, QUESTIONS, type Answers } from "@/lib/onboardingFlow";

function StepRow({ label, state, index }: { label: string; state: "done" | "active" | "waiting"; index: number }) {
  return (
    <li
      className="flex items-center gap-2.5 rounded-full bg-card px-2.5 py-2.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-backwards"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <span className="grid h-[22px] w-[22px] shrink-0 place-items-center">
        {state === "done" ? (
          <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-success/15 text-success motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200">
            <CheckIcon size={13} weight="bold" />
          </span>
        ) : state === "active" ? (
          <CircleNotchIcon size={20} className="animate-spin text-muted-foreground" />
        ) : (
          <span className="h-[18px] w-[18px] rounded-full border-2 border-border" />
        )}
      </span>
      <span className={`min-w-0 flex-1 truncate text-base font-medium ${state === "done" ? "text-success" : state === "active" ? "onboard-shimmer" : "text-muted-foreground/70"}`}>
        {state === "done" ? label : `${label}...`}
      </span>
    </li>
  );
}

function Questions({ answers, onAnswer }: { answers: Answers; onAnswer: (a: Answers) => void }) {
  const [at, setAt] = useState(() => firstOpenQuestion(answers));
  const card = useRef<HTMLDivElement>(null);
  const keepFocus = useRef(false);
  const finished = at >= QUESTIONS.length;
  const q = QUESTIONS[Math.min(at, QUESTIONS.length - 1)];
  useEffect(() => {
    if (!keepFocus.current) return;
    keepFocus.current = false;
    card.current?.querySelector<HTMLElement>("button, p[tabindex]")?.focus({ preventScroll: true });
  }, [at]);
  const pick = (value: unknown) => {
    const next = { ...answers, [q.key]: value } as Answers;
    onAnswer(next);
    keepFocus.current = !!card.current?.contains(document.activeElement);
    window.setTimeout(() => setAt(firstOpenQuestion(next) >= QUESTIONS.length ? QUESTIONS.length : Math.max(at + 1, firstOpenQuestion(next))), 180);
  };
  return (
    <section aria-label="Optional questions" className="flex w-full flex-col items-center gap-3">
      <div ref={card} aria-live="polite" className="w-full max-w-[496px] rounded-[20px] bg-card p-[18px]">
        {finished ? (
          <p tabIndex={-1} className="flex items-center justify-center gap-2 py-2 text-[15px] font-medium text-success outline-none">
            <CheckIcon size={16} weight="bold" /> Thanks. Your plan starts from these.
          </p>
        ) : (
          <div key={q.key} className="flex flex-col items-center gap-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-2">
            <h2 className="text-center text-base font-bold text-foreground">{q.ask}</h2>
            <div role="group" aria-label={q.ask} className="flex flex-wrap justify-center gap-2">
              {q.options.map((o) => {
                const on = answers[q.key] === o.value;
                return (
                  <button
                    key={String(o.value)}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pick(o.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors [@media(pointer:coarse)]:min-h-11 ${
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border/80 bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center">
        {QUESTIONS.map((x, i) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setAt(i)}
            aria-label={`Question ${i + 1} of ${QUESTIONS.length}${answers[x.key] !== undefined ? ", answered" : ""}`}
            aria-current={i === at ? "step" : undefined}
            className="group grid h-6 min-w-6 place-items-center rounded-full [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11"
          >
            <span className={`block h-2 rounded-full transition-all ${i === at ? "w-5 bg-foreground/60" : answers[x.key] !== undefined ? "w-2 bg-success/60" : "w-2 bg-foreground/15 group-hover:bg-foreground/30"}`} />
          </button>
        ))}
      </div>
    </section>
  );
}

export function ReadingStep({
  title,
  steps,
  active,
  failure,
  answers,
  onAnswer,
  onRetry,
  onByHand,
  titleId,
  done = false,
  onMoveOn,
}: {
  title: string;
  steps: readonly string[];
  active: number;
  failure: string | null;
  answers: Answers;
  onAnswer: (a: Answers) => void;
  onRetry: () => void;
  onByHand: () => void;
  titleId: string;
  /** the read is finished; the questions still open hold this screen until answered or onMoveOn */
  done?: boolean;
  onMoveOn?: () => void;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 45_000);
    return () => window.clearTimeout(t);
  }, []);

  if (failure) {
    return (
      <div className="flex w-full max-w-[520px] flex-1 flex-col justify-center gap-8 pb-[8vh] motion-safe:animate-in motion-safe:fade-in-0">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
            <WarningCircleIcon size={28} />
          </span>
          <StepTitle id={titleId} title={title} lead={failure} />
          <p className="sr-only" role="alert">
            {title}. {failure}
          </p>
        </div>
        <Actions className="sm:justify-center">
          <QuietPill onClick={onRetry}>Try another address</QuietPill>
          <PrimaryPill onClick={onByHand}>Fill it in myself</PrimaryPill>
        </Actions>
      </div>
    );
  }

  const label = steps[Math.min(active, steps.length - 1)];
  return (
    <div className="flex w-full max-w-[680px] flex-1 flex-col items-center gap-10">
      <div className="flex w-full flex-1 flex-col items-center gap-6 pt-[6vh]">
        <StepTitle id={titleId} title={title} lead={done ? "Done reading." : slow ? "Still reading. Big sites take a little longer." : "Usually under a minute."} />
        <ol className="flex w-full max-w-[300px] flex-col gap-2.5" aria-label="What we're reading">
          {steps.map((s, i) => (
            <StepRow key={s} label={s} index={i} state={i < active ? "done" : i === active ? "active" : "waiting"} />
          ))}
        </ol>
        <p className="sr-only" aria-live="polite">
          {active >= steps.length ? "Done reading." : `${label}.`}
        </p>
      </div>
      <div className="flex w-full flex-col items-center gap-5">
        <Questions answers={answers} onAnswer={onAnswer} />
        {done && onMoveOn && <PrimaryPill onClick={onMoveOn}>See my brand</PrimaryPill>}
      </div>
    </div>
  );
}
