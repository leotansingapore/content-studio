// Next up on Leo's Home (docs/north-star/items/agent-home.md): needsYouItems' list, the first drawn large with its
// buttons, the next two as rows and the rest behind "+<k> more waiting" (?waiting=all, replace). Each "..." menu hides
// its item for today on this device (cs-home-hidden-<scoped>), with Undo.

import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { needsYouItems, nextUpLabel, type NextUpInput, type NextUpItem } from "@/lib/needsYou";
import { scoped } from "@/lib/profiles";
import { cn } from "@/lib/utils";

type Hidden = Record<string, string>;
const hiddenKey = (userId: string) => `cs-home-hidden-${scoped(userId)}`;
function readHidden(userId: string): Hidden {
  try {
    const v = JSON.parse(localStorage.getItem(hiddenKey(userId)) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

interface Props {
  userId: string;
  input: Omit<NextUpInput, "hidden">;
  /** The Singapore day. */
  today: string;
  markPosted: (draftId: string) => void;
  /** Why a post can't be marked posted yet (the team approval rule), or null. */
  blocked: (draftId: string) => string | null;
  className?: string;
}

export default function NextUp({ userId, input, today, markPosted, blocked, className }: Props) {
  const [hidden, setHidden] = useState(() => readHidden(userId));
  const [menu, setMenu] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const { toast } = useToast();
  const all = params.get("waiting") === "all";
  const items = needsYouItems({ ...input, hidden }, today);
  const [first, ...rest] = items;
  const more = rest.length - 2;

  const update = (fn: (h: Hidden) => Hidden) =>
    setHidden((h) => {
      const next = fn(h);
      try {
        localStorage.setItem(hiddenKey(userId), JSON.stringify(next));
      } catch {
        /* blocked storage: hidden for this visit only */
      }
      return next;
    });
  const hide = (id: string) => {
    setMenu(null);
    // only today's hides are kept, so the map never outgrows a day
    update((h) => ({ ...Object.fromEntries(Object.entries(h).filter(([, d]) => d === today)), [id]: today }));
    toast({
      title: "Hidden until tomorrow.",
      action: (
        <ToastAction altText="Undo" onClick={() => update(({ [id]: _, ...h }) => h)}>
          Undo
        </ToastAction>
      ),
    });
  };
  const toggle = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (all) next.delete("waiting");
        else next.set("waiting", "all");
        return next;
      },
      { replace: true },
    );

  const menuFor = (item: NextUpItem) => (
    <div className="relative shrink-0" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setMenu(null)}>
      <Button type="button" variant="ghost" size="icon" onClick={() => setMenu(menu === item.id ? null : item.id)} aria-label={`More for ${item.title}`} aria-expanded={menu === item.id} className="h-9 w-9 text-muted-foreground">
        <MoreHorizontal />
      </Button>
      {menu === item.id && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-border bg-popover p-1 shadow-lg">
          <button type="button" role="menuitem" onClick={() => hide(item.id)} className="flex min-h-9 w-full items-center rounded-md px-2 text-left text-sm hover:bg-accent [@media(pointer:coarse)]:min-h-11">
            Hide for today
          </button>
        </div>
      )}
    </div>
  );
  const actionsOf = (item: NextUpItem, main = false) => (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {item.actions.map((a, i) => {
        if (a.markPosted) {
          const why = blocked(a.markPosted);
          return (
            <Button key={a.label} type="button" size="sm" variant="outline" onClick={() => markPosted(a.markPosted!)} disabled={why !== null} title={why ?? undefined} className="gap-1 [@media(pointer:coarse)]:h-11">
              <CheckCircle2 /> {a.label}
            </Button>
          );
        }
        return (
          <Button key={a.label} asChild size="sm" variant={main && i === 0 ? "default" : "outline"} className="[@media(pointer:coarse)]:h-11">
            <Link to={a.to!}>{a.label}</Link>
          </Button>
        );
      })}
    </div>
  );
  const count = (n?: number) => n !== undefined && <span className="ml-1.5 font-semibold tabular-nums text-muted-foreground">{n}</span>;

  return (
    <section id="next-up" aria-labelledby="next-up-label" className={cn("scroll-mt-20 rounded-2xl border border-border/70 bg-card p-4 shadow-card sm:p-5", className)}>
      <div className="flex min-h-9 items-center justify-between gap-2">
        <p id="next-up-label" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
          {nextUpLabel(items.length)}
        </p>
        {first && menuFor(first)}
      </div>
      {!first ? (
        <p className="mt-1 text-sm text-muted-foreground">Nothing needs you right now.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1 basis-64">
              <h2 className="font-serif text-xl font-semibold leading-snug text-foreground sm:text-2xl">
                {first.title}
                {count(first.n)}
              </h2>
              {first.quote && <p className="mt-1 line-clamp-2 text-sm text-foreground">{first.quote}</p>}
              {first.line && <p className="mt-0.5 text-sm text-muted-foreground">{first.line}</p>}
            </div>
            {actionsOf(first, true)}
          </div>
          {rest.length > 0 && (
            <ul className="mt-4 divide-y divide-border/60 border-t border-border/60">
              {(all ? rest : rest.slice(0, 2)).map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.title}
                      {count(item.n)}
                    </p>
                    {(item.quote || item.line) && <p className="truncate text-xs text-muted-foreground">{item.quote || item.line}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    {actionsOf(item)}
                    {menuFor(item)}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {more > 0 && (
            <button type="button" onClick={toggle} aria-expanded={all} className="mt-1 inline-flex min-h-9 items-center text-xs font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11">
              {all ? "Show fewer" : `+${more} more waiting`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
