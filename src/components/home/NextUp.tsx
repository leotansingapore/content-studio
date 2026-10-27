// Next up on Leo's Home (docs/north-star/items/agent-home.md): needsYouItems' list, the first drawn large with its
// buttons, the next two as rows and the rest behind "+<k> more waiting" (?waiting=all, replace). A waiting card on top
// is decided here, as Fastlane's Home does: Approve with its price, or Not now, through the engine the chat's card uses.
// Each "..." menu snoozes its item until tomorrow or for a week, or dismisses it until it changes, on this device
// (cs-home-hidden-<scoped>), with Undo.

import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, MoreHorizontal } from "lucide-react";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { leftOf } from "@/lib/agentBudget";
import type { AgentCard } from "@/lib/agentCards";
import { approveLabel, blockedReason, NOT_MADE, press } from "@/lib/agentRun";
import type { Usage } from "@/lib/aiUsage";
import { addDays, keyToDate } from "@/lib/dueDates";
import { itemSig, needsYouItems, nextUpLabel, type NextUpInput, type NextUpItem } from "@/lib/needsYou";
import { scoped } from "@/lib/profiles";
import { cn } from "@/lib/utils";

type Hidden = Record<string, string>;
type Waiting = NonNullable<NextUpInput["cards"]>[number] & { card: AgentCard };
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
  markPosted: (draftId: string) => void;
  /** Why a post can't be marked posted yet (the team approval rule), or null. */
  blocked: (draftId: string) => string | null;
  className?: string;
}

export default function NextUp({ userId, input, today, usage, markPosted, blocked, className }: Props) {
  const [hidden, setHidden] = useState(() => readHidden(userId));
  const [menu, setMenu] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const { toast } = useToast();
  const all = params.get("waiting") === "all";
  const items = needsYouItems({ ...input, hidden }, today);
  const [first, ...rest] = items;
  const more = rest.length - 2;
  const waiting = first?.kind === "card" ? input.cards?.find((w) => `card:${w.card.id}` === first.id) : undefined;
  // a competitor card needs its name typed in the chat, so Open is its only way on
  const decide = waiting && waiting.card.kind !== "competitor" ? waiting : undefined;

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
    const live = new Set(needsYouItems({ ...input, hidden: {} }, today).map((i) => i.id));
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
        <MoreHorizontal />
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
              {/* a card's price line rides on its Approve button */}
              {first.line && !decide && <p className="mt-0.5 text-sm text-muted-foreground">{first.line}</p>}
            </div>
            {decide ? <Decide userId={userId} waiting={decide} usage={usage} open={first.actions[0]?.to} /> : actionsOf(first, true)}
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

/** Approve (its price on it) and Not now for the waiting card on top, then Open for the whole card in its chat. The
 * engine checks the uses again on the press; one it refuses keeps the card here with its line. */
function Decide({ userId, waiting, usage, open }: { userId: string; waiting: Waiting; usage: Usage | null; open?: string }) {
  const { card, thread, msg } = waiting;
  const { toast } = useToast();
  const navigate = useNavigate();
  const reason = blockedReason(userId, card, usage);
  const left = card.needs[0] ? leftOf(usage, card.needs[0].feature) : null;
  const run = (button: "approve" | "decline") => {
    // the press marks the card at once, so it leaves Next up (and a second press does nothing); the promise ends with the make
    press(userId, thread, msg, button).catch(() => toast({ title: "That didn't go through. Try again.", variant: "destructive" }));
    toast(
      button === "decline"
        ? { title: NOT_MADE }
        : {
            title: "Started. It shows in the chat when it's ready.",
            action: open ? (
              <ToastAction altText="Open the chat" onClick={() => navigate(open)}>
                Open chat
              </ToastAction>
            ) : undefined,
          },
    );
  };
  return (
    <div className="flex min-w-0 max-w-full flex-col items-start gap-1.5 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => run("approve")} disabled={!!reason} className="h-auto min-h-9 gap-2 whitespace-normal py-1.5 text-left [@media(pointer:coarse)]:min-h-11">
          <span>{approveLabel(card)}</span>
          {card.price && (
            <span className="text-[11px] [&>span]:text-primary-foreground/85">
              <PriceChip price={card.price} left={card.step === "script" ? null : left} uses={card.needs[0]?.n} />
            </span>
          )}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => run("decline")} className="[@media(pointer:coarse)]:h-11">
          Not now
        </Button>
        {open && (
          <Button asChild size="sm" variant="outline" className="[@media(pointer:coarse)]:h-11">
            <Link to={open}>Open</Link>
          </Button>
        )}
      </div>
      {(reason || card.error) && <p className="max-w-xs text-xs text-muted-foreground sm:text-right">{reason ?? card.error}</p>}
    </div>
  );
}
