// "Your work" beside the agent's chat (Fastlane's chat page, 11 Nov walk; docs/fastlane-nav-gap.md): three counters
// (needs you, in flight, made) and three lists, Waiting on your yes, Making and Made, read from the chats themselves
// (agentWork.ts). Every row opens its card or result in its chat. Beside the chat from xl up, where Hide is remembered
// on this device; below that the page opens it as a sheet (?panel=work, `sheet`).
import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight, Hand, Loader2, X, type LucideIcon } from "lucide-react";
import { turnOf } from "@/lib/agentRun";
import { workCounters, workOf, type WorkItem } from "@/lib/agentWork";
import type { AgentThread } from "@/lib/agentThreads";
import { links } from "@/lib/links";
import { ago } from "@/lib/slideshow";
import { cn } from "@/lib/utils";

const HIDDEN = "cs-work-panel-hidden";
const MADE_SHOWN = 6;
const HEAD = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";

const readHidden = () => {
  try {
    return localStorage.getItem(HIDDEN) === "1";
  } catch {
    return false;
  }
};

function Rows({ items, icon: Icon, spin, sub }: { items: WorkItem[]; icon: LucideIcon; spin?: boolean; sub: (i: WorkItem) => string }) {
  return (
    <ul className="mt-1 space-y-0.5">
      {items.map((i) => (
        <li key={i.msg}>
          <Link to={links.agent({ thread: i.thread, m: i.msg })} className="flex min-h-11 items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-accent">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border/70 bg-card text-muted-foreground">
              <Icon className={cn("h-3.5 w-3.5", spin && "animate-spin")} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 break-words text-sm font-medium text-foreground">{i.title}</span>
              <span className="block text-[11px] text-muted-foreground">{sub(i)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function WorkPanel({ threads, sheet, onClose }: { threads: AgentThread[]; sheet?: boolean; onClose?: () => void }) {
  const [hidden, setHidden] = useState(readHidden);
  const toggle = (next: boolean) => {
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN, next ? "1" : "0");
    } catch {
      // a blocked store still hides it for now
    }
  };
  if (hidden && !sheet)
    return (
      <button type="button" onClick={() => toggle(false)} className="hidden h-9 shrink-0 self-start rounded-lg border border-border/70 px-3 text-sm text-muted-foreground hover:text-foreground xl:block">
        Your work
      </button>
    );
  const work = workOf(threads);
  const [needs, flight, made] = workCounters(work);
  // the live step of a make this tab is running; a job another device runs reads Making
  const step = (i: WorkItem) => {
    const t = turnOf(i.thread);
    return `${i.type} | ${(t?.msg === i.msg && t.line?.replace(/\.\.\.$/, "")) || "Making"}`;
  };
  return (
    <aside aria-label="Your work" className={sheet ? "flex h-full flex-col" : "hidden w-64 shrink-0 flex-col border-l border-border/60 pl-5 xl:flex"}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">Your work</h2>
        {sheet && onClose && (
          <button type="button" onClick={onClose} aria-label="Close Your work" className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
        {!sheet && (
          <button type="button" onClick={() => toggle(true)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border/70 px-2.5 text-xs text-muted-foreground hover:text-foreground">
            Hide <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums" aria-label="Counts">
        <li className={work.waiting.length ? "font-semibold text-primary" : "text-muted-foreground"}>{needs}</li>
        <li className="text-muted-foreground">{flight}</li>
        <li className="text-muted-foreground">{made}</li>
      </ul>
      <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto">
        {work.waiting.length > 0 && (
          <section aria-label="Waiting on your yes">
            <p className={HEAD}>Waiting on your yes</p>
            <Rows items={work.waiting} icon={Hand} sub={(i) => `${i.type} | ${ago(i.at)}`} />
          </section>
        )}
        {work.making.length > 0 && (
          <section aria-label="Making" aria-live="polite">
            <p className={HEAD}>Making</p>
            <Rows items={work.making} icon={Loader2} spin sub={step} />
          </section>
        )}
        <section aria-label="Made">
          <div className="flex items-center justify-between">
            <p className={HEAD}>Made</p>
            <Link to={links.activity()} className="inline-flex min-h-9 items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
              All activity <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {work.made.length ? (
            <Rows items={work.made.slice(0, MADE_SHOWN)} icon={Check} sub={(i) => `${i.type} | ${ago(i.at)}`} />
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">What the agent makes for you lands here.</p>
          )}
        </section>
      </div>
    </aside>
  );
}
