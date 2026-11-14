// Next up on Home (docs/north-star/items/agent-home.md), for every sign-in since 12 Nov: needsYouItems' list, the first
// drawn large with its buttons, the next two as rows and the rest behind "View all <n>" (?waiting=all, replace), as
// Fastlane's Home lays it out. Each item's first button is its next step, then Open. A customer's Home passes `shape`
// to add its own items (an unfinished post, setup). On Leo's, a waiting card is decided here with Approve and its price
// (NextUpDecide, its own chunk, so the agent engine still loads for Leo only), filled on top and quiet in the rows.
// Each "..." menu snoozes its item until tomorrow or for a week, or dismisses it until it changes, on this device
// (cs-home-hidden-<scoped>), with Undo.

import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircleIcon, CaretRightIcon, DotsThreeIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import type { AgentCard } from "@/lib/agentCards";
import type { Usage } from "@/lib/aiUsage";
import { addDays, keyToDate } from "@/lib/dueDates";
import { isHidden, itemSig, needsYouItems, type NextUpInput, type NextUpItem } from "@/lib/needsYou";
import { scoped } from "@/lib/profiles";
import { cn } from "@/lib/utils";

const Decide = lazy(() => import("@/components/home/NextUpDecide"));

type Hidden = Record<string, string>;
export type Waiting = NonNullable<NextUpInput["cards"]>[number] & { card: AgentCard };
const hiddenKey = (userId: string) => `cs-home-hidden-${scoped(userId)}`;
function readHidden(userId: string): Hidden {
  try {
    const v = JSON.parse(localStorage.getItem(hiddenKey(userId)) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
const dayName = (key: string) => keyToDate(key).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

interface Props {
  userId: string;
  input: Omit<NextUpInput, "hidden" | "cards"> & { cards?: Waiting[] };
  /** The Singapore day. */
  today: string;
  /** Today's uses, for Approve's price and the reason it waits. */
  usage: Usage | null;
  /** The page's own items added to needsYouItems' list (a customer's unfinished post and setup step). */
  shape?: (items: NextUpItem[]) => NextUpItem[];
  /** Said when nothing waits. */
  empty?: ReactNode;
  /** Told how many items show, so the page can give its one filled button elsewhere when there are none. */
  onCount?: (n: number) => void;
  markPosted: (draftId: string) => void;
  /** Why a post can't be marked posted yet (the team approval rule), or null. */
  blocked: (draftId: string) => string | null;
  className?: string;
}

export default function NextUp({ userId, input, today, usage, markPosted, blocked, shape = (i) => i, empty = "Nothing needs you right now.", onCount, className }: Props) {
  const [hidden, setHidden] = useState(() => readHidden(userId));
  const [menu, setMenu] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const { toast } = useToast();
  const all = params.get("waiting") === "all";
  const items = shape(needsYouItems({ ...input, hidden }, today)).filter((i) => !hidden[i.id] || !isHidden(hidden[i.id], i, today));
  const [first, ...rest] = items;
  useEffect(() => onCount?.(items.length), [items.length, onCount]);
  const more = rest.length - 2;
  const decideOf = (item?: NextUpItem) => {
    const waiting = item?.kind === "card" ? input.cards?.find((w) => `card:${w.card.id}` === item.id) : undefined;
    // a competitor card needs its name typed in the chat, so Open is its only way on
    return waiting && waiting.card.kind !== "competitor" ? waiting : undefined;
  };
  const decide = decideOf(first);

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
  const choices = [
    { label: "Snooze until tomorrow", hint: "Back tomorrow", done: "Snoozed until tomorrow.", value: () => today },
    { label: "Snooze for a week", hint: `Back ${dayName(addDays(today, 7))}`, done: `Snoozed until ${dayName(addDays(today, 7))}.`, value: () => addDays(today, 6) },
    { label: "Dismiss", hint: "Comes back if it changes", done: "Dismissed. It comes back if it changes.", value: (i: NextUpItem) => `=${itemSig(i)}` },
  ];
  const hide = (item: NextUpItem, c: (typeof choices)[number]) => {
    setMenu(null);
    // keep snoozes still running and dismissals of items still listed, so the map never outgrows the list
    const live = new Set(shape(needsYouItems({ ...input, hidden: {} }, today)).map((i) => i.id));
    const kept = (h: Hidden) => Object.fromEntries(Object.entries(h).filter(([id, v]) => (v.startsWith("=") ? live.has(id) : v >= today)));
    update((h) => ({ ...kept(h), [item.id]: c.value(item) }));
    toast({
      title: c.done,
      action: (
        <ToastAction altText="Undo" onClick={() => update(({ [item.id]: _, ...h }) => h)}>
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
      <Button type="button" variant="ghost" size="icon" onClick={() => setMenu(menu === item.id ? null : item.id)} aria-label={`More for ${item.title}`} aria-haspopup="menu" aria-expanded={menu === item.id} className="h-9 w-9 text-muted-foreground">
        <DotsThreeIcon />
      </Button>
      {menu === item.id && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-border bg-popover p-1 shadow-lg">
          {choices.map((c) => (
            <button key={c.label} type="button" role="menuitem" onClick={() => hide(item, c)} className="flex min-h-11 w-full flex-col justify-center rounded-md px-2 py-1.5 text-left hover:bg-accent">
              <span className="text-sm">{c.label}</span>
              <span className="text-xs text-muted-foreground">{c.hint}</span>
            </button>
          ))}
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
              <CheckCircleIcon /> {a.label}
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
  const fallback = <Button asChild size="sm" variant="outline">{first?.actions[0]?.to ? <Link to={first.actions[0].to}>Open</Link> : <span />}</Button>;
  // a row's waiting card: Approve with its price and Not now, quiet, as the card on top has them
  const rowActions = (item: NextUpItem) => {
    const w = decideOf(item);
    return w ? (
      <Suspense fallback={actionsOf(item)}>
        <Decide userId={userId} waiting={w} usage={usage} open={item.actions[0]?.to} main={false} />
      </Suspense>
    ) : (
      actionsOf(item)
    );
  };

  return (
    <section id="next-up" aria-labelledby="next-up-label" className={cn("scroll-mt-20 space-y-2", className)}>
      {/* Fastlane's Home: "Next up" with its count, View all at the right; the list itself is one card */}
      <div className="flex min-h-9 items-center justify-between gap-3">
        <h2 id="next-up-label" className="flex items-center gap-2 text-lg font-semibold text-foreground">
          Next up
          {items.length > 0 && <span className="rounded-md bg-muted px-1.5 text-xs font-semibold tabular-nums text-muted-foreground">{items.length}</span>}
        </h2>
        {more > 0 && (
          <button type="button" onClick={toggle} aria-expanded={all} className="inline-flex min-h-9 items-center gap-0.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground [@media(pointer:coarse)]:min-h-11">
            {all ? "Show fewer" : `View all ${items.length}`} <CaretRightIcon className={cn("h-4 w-4 transition-transform", all && "-rotate-90")} />
          </button>
        )}
      </div>
      <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
      {!first ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1 basis-64">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-serif text-xl font-semibold leading-snug text-foreground sm:text-2xl">
                  {first.title}
                  {count(first.n)}
                </h3>
                {menuFor(first)}
              </div>
              {first.quote && <p className="mt-1 line-clamp-2 text-sm text-foreground">{first.quote}</p>}
              {/* a card's price line rides on its Approve button */}
              {first.line && !decide && <p className="mt-0.5 text-sm text-muted-foreground">{first.line}</p>}
            </div>
            {decide ? (
              <Suspense fallback={fallback}>
                <Decide userId={userId} waiting={decide} usage={usage} open={first.actions[0]?.to} />
              </Suspense>
            ) : (
              actionsOf(first, true)
            )}
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
                    {rowActions(item)}
                    {menuFor(item)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      </div>
    </section>
  );
}
