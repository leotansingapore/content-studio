import { useEffect, useId, useRef, useState } from "react";
import { BriefcaseIcon, ChartLineUpIcon, CheckIcon, HouseLineIcon, LaptopIcon, PencilSimpleLineIcon, PersonSimpleRunIcon, ScalesIcon, type Icon } from "@phosphor-icons/react";
import { Actions, PrimaryPill, StepTitle, fieldClass } from "@/components/onboarding/parts";
import { MAX_PROFESSION_CHARS, PROFESSION_CHOICES } from "@/lib/profession";
import { WORK_LINES } from "@/lib/onboardingFlow";

const ICONS: Record<string, Icon> = {
  "Financial adviser": ChartLineUpIcon,
  Coach: PersonSimpleRunIcon,
  Consultant: BriefcaseIcon,
  "Real estate agent": HouseLineIcon,
  Freelancer: LaptopIcon,
  Lawyer: ScalesIcon,
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function WorkStep({ value, onChange, onContinue, titleId }: { value: string; onChange: (v: string) => void; onContinue: () => void; titleId: string }) {
  const id = useId();
  const listed = PROFESSION_CHOICES.find((c) => same(c, value) || (c === "Financial adviser" && same(value, "financial advisor")));
  const [other, setOther] = useState(() => !!value.trim() && !listed);
  const otherRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (other) otherRef.current?.focus();
  }, [other]);

  const card = (key: string, title: string, line: string, picked: boolean, Glyph: Icon, onPick: () => void) => (
    <button
      key={key}
      type="button"
      aria-pressed={picked}
      onClick={onPick}
      className={`group relative flex w-[calc(50%-6px)] flex-col overflow-hidden rounded-[20px] border-2 text-left transition-colors sm:w-[200px] ${
        picked ? "border-success bg-card bg-[linear-gradient(hsl(var(--success)/0.07),hsl(var(--success)/0.07))]" : "border-transparent bg-card hover:border-border"
      }`}
    >
      {picked && (
        <span className="absolute right-3 top-3 z-10 grid h-6 w-6 place-items-center rounded-full bg-success text-white dark:text-black motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200">
          <CheckIcon size={14} weight="bold" />
        </span>
      )}
      <span className="grid h-[92px] w-full place-items-center bg-gradient-to-br from-primary/10 via-brand/10 to-primary/5">
        <span className={`grid h-14 w-14 place-items-center rounded-2xl shadow-card transition-transform motion-safe:group-hover:scale-105 ${picked ? "bg-success text-white dark:text-black" : "bg-card text-primary"}`}>
          <Glyph size={28} weight={picked ? "fill" : "duotone"} />
        </span>
      </span>
      <span className="space-y-1 p-3.5">
        <span className={`block text-lg font-bold leading-snug ${picked ? "text-success" : "text-foreground"}`}>{title}</span>
        <span className={`block text-sm font-medium leading-snug ${picked ? "text-success" : "text-muted-foreground"}`}>{line}</span>
      </span>
    </button>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onContinue();
      }}
      className="flex w-full max-w-[880px] flex-1 flex-col justify-center gap-10 pb-[2vh] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300"
    >
      <StepTitle id={titleId} title="What do you do?" lead="Every post is written for this. You can change it later." />
      <div role="group" aria-labelledby={titleId} className="flex flex-wrap justify-center gap-3 sm:gap-5">
        {PROFESSION_CHOICES.map((c) =>
          card(c, c, WORK_LINES[c] ?? "", !other && listed === c, ICONS[c] ?? BriefcaseIcon, () => {
            setOther(false);
            onChange(c);
          }),
        )}
        {card("other", "Something else", other && value.trim() ? value.trim() : "Type what you do", other, PencilSimpleLineIcon, () => {
          if (!other) onChange("");
          setOther(true);
        })}
      </div>
      {other && (
        <div className="mx-auto w-full max-w-[420px] space-y-1.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1">
          <label htmlFor={`${id}-own`} className="text-base font-medium">
            What you do, in a few words
          </label>
          <input ref={otherRef} id={`${id}-own`} value={value} maxLength={MAX_PROFESSION_CHARS} onChange={(e) => onChange(e.target.value)} placeholder="Like photographer, dentist or bakery" className={fieldClass} />
        </div>
      )}
      <Actions className="sm:justify-center">
        <PrimaryPill type="submit" disabled={!value.trim()}>
          Continue
        </PrimaryPill>
      </Actions>
    </form>
  );
}
