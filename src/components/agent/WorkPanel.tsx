// "Your work" beside the agent's chat (Fastlane's chat page, docs/fastlane-nav-gap.md): what is running now and the
// last things that ran, from the Activity log, each opening its own page. Hide is remembered on this device.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BookMarked, CalendarClock, ChevronRight, Lightbulb, Play, Plug, Repeat, Send, Sparkles, type LucideIcon } from "lucide-react";
import { isBusy } from "@/components/agent/ThreadList";
import { ACTIVITY_CHANGED, WHO_LABELS, recentActivity, type ActivityKind } from "@/lib/activity";
import type { AgentThread } from "@/lib/agentThreads";
import { links } from "@/lib/links";
import { ago } from "@/lib/slideshow";

const HIDDEN = "cs-work-panel-hidden";
const SHOWN = 6;
const ICONS: Record<ActivityKind, LucideIcon> = { post: Send, make: Sparkles, remix: Repeat, brand: BookMarked, learning: Lightbulb, plan: CalendarClock, run: Play, connect: Plug, correction: AlertTriangle };

const readHidden = () => {
  try {
    return localStorage.getItem(HIDDEN) === "1";
  } catch {
    return false;
  }
};

export default function WorkPanel({ userId, threads }: { userId: string; threads: AgentThread[] }) {
  const [hidden, setHidden] = useState(readHidden);
  const [events, setEvents] = useState(() => recentActivity(userId, SHOWN));
  useEffect(() => {
    const reread = () => setEvents(recentActivity(userId, SHOWN));
    reread();
    window.addEventListener(ACTIVITY_CHANGED, reread);
    return () => window.removeEventListener(ACTIVITY_CHANGED, reread);
  }, [userId]);
  const toggle = (next: boolean) => {
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN, next ? "1" : "0");
    } catch {
      // a blocked store still hides it for now
    }
  };
  if (hidden)
    return (
      <button type="button" onClick={() => toggle(false)} className="hidden h-9 shrink-0 self-start rounded-lg border border-border/70 px-3 text-sm text-muted-foreground hover:text-foreground xl:block">
        Your work
      </button>
    );
  const running = threads.filter(isBusy).length;
  return (
    <aside aria-label="Your work" className="hidden w-64 shrink-0 flex-col border-l border-border/60 pl-5 xl:flex">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">Your work</h2>
          <p className="text-xs text-muted-foreground">{running ? `${running} running now` : "Nothing running"}</p>
        </div>
        <button type="button" onClick={() => toggle(true)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border/70 px-2.5 text-xs text-muted-foreground hover:text-foreground">
          Hide <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-5 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Recent</p>
        <Link to={links.activity()} className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
          All activity <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {events.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">What you and the agent make shows up here.</p>
      ) : (
        <ul className="mt-2 space-y-0.5 overflow-y-auto">
          {events.map((e) => {
            const Icon = ICONS[e.kind];
            const body = (
              <>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border/70 bg-card text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-medium text-foreground">{e.title}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {WHO_LABELS[e.who]} | {ago(e.at)}
                  </span>
                </span>
              </>
            );
            return (
              <li key={e.id}>
                {e.link ? (
                  <Link to={e.link} className="flex items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-accent">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-start gap-2.5 p-2">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
