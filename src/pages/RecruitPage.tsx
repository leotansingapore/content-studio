import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Check } from "lucide-react";
import SectionTabs, { RECRUIT_TABS } from "@/components/SectionTabs";
import BrandBrain from "@/components/recruit/BrandBrain";
import Conversations from "@/components/recruit/Conversations";
import Agent from "@/components/recruit/Agent";
import { useRecruitBrain } from "@/hooks/useRecruitBrain";
import { partsDone } from "@/lib/recruit";

// Each part links to where it is filled in; "One system" (the Friday numbers) lives on Analytics.
const PARTS = [
  { key: "candidate", label: "One candidate", to: "/recruit#part-1" },
  { key: "promise", label: "One promise", to: "/recruit#part-2" },
  { key: "conversations", label: "Ten conversations", to: "/recruit/conversations" },
  { key: "story", label: "One story", to: "/recruit#part-4" },
  { key: "system", label: "One system", to: "/analytics#recruit-numbers" },
] as const;

// "From Chasing to Chosen": the #TopofMind recruitment kit as three screens.
// One Brand Brain document backs all three, so nothing is typed twice.
export default function RecruitPage() {
  const { pathname, hash, key: navKey } = useLocation();
  const { userId, brain, update, savedAt, ready } = useRecruitBrain();
  const done = partsDone(brain);
  const doneCount = Object.values(done).filter(Boolean).length;
  // A part link scrolls to its card, on every tap (navKey changes even for the same hash).
  useEffect(() => {
    if (ready && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [ready, hash, navKey]);
  const tab = pathname.startsWith("/recruit/conversations") ? "conversations" : pathname.startsWith("/recruit/agent") ? "agent" : "brain";

  return (
    <div className="space-y-5">
      <SectionTabs tabs={RECRUIT_TABS} />
      <header className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
            From chasing to chosen
          </h1>
          {savedAt && (
            <span className="text-[11px] text-muted-foreground">
              Saved {new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>
        <ol className="flex flex-wrap gap-1.5" aria-label={`${doneCount} of 5 parts done`}>
          {PARTS.map((p) => (
            <li key={p.key}>
              <Link
                to={p.to}
                className={`inline-flex h-9 items-center gap-1 rounded-full border px-3 text-[11px] font-semibold transition-colors sm:h-7 ${
                  done[p.key]
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {done[p.key] && <Check className="h-3 w-3" />}
                {p.label}
              </Link>
            </li>
          ))}
        </ol>
      </header>

      {!ready && <div className="h-64 animate-pulse rounded-xl bg-muted/50" aria-busy="true" aria-label="Loading your Brand Brain" />}
      {ready && tab === "brain" && <BrandBrain brain={brain} update={update} done={done} />}
      {ready && tab === "conversations" && <Conversations brain={brain} update={update} done={done.conversations} />}
      {ready && tab === "agent" && <Agent brain={brain} update={update} userId={userId} />}
    </div>
  );
}
