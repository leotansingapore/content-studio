// The waiting agent card on top of Leo's Next up: Approve with its price, Not now, and Open for the card in its chat.
// Its own chunk (NextUp loads it lazily): it pulls in the agent engine, which only Leo's sign-ins load.

import { Link, useNavigate } from "react-router-dom";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import type { Waiting } from "@/components/home/NextUp";
import { leftOf } from "@/lib/agentBudget";
import { approveLabel, blockedReason, NOT_MADE, press } from "@/lib/agentRun";
import type { Usage } from "@/lib/aiUsage";

/** Approve (its price on it) and Not now for the waiting card on top, then Open for the whole card in its chat. The
 * engine checks the uses again on the press; one it refuses keeps the card here with its line. */
export default function Decide({ userId, waiting, usage, open }: { userId: string; waiting: Waiting; usage: Usage | null; open?: string }) {
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
