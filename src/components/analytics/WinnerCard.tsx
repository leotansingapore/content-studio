// Winner found (docs/north-star/items/remix-own-winners.md), Leo only, at the top of Analytics' Top posts (#winners).
// The winners are measured and Jev-checked outside React (winners.ts, run here on open); versions are made only on a
// press of "Make 3 versions" (Leo, 25 Oct, Q3), through the remix job, so leaving the page does not stop them.

import { useEffect, useReducer, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import PriceChip from "@/components/PriceChip";
import { toast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import { labelForDimension } from "@/lib/analytics";
import type { DraftEntry } from "@/lib/draftHistory";
import { links } from "@/lib/links";
import { toPlainText } from "@/lib/plainText";
import { sourceKey } from "@/lib/remixSource";
import { useUrlUpdate } from "@/lib/urlState";
import { checkWinners, makeWinnerVersions, onWinners, undoWinner, winnerCards, type WinnerCard as Card } from "@/lib/winners";

const HEADING: Record<Card["status"], string> = {
  ready: "Winner found",
  limit: "Winner found",
  making: "Winner found. Making 3 versions...",
  made: "Winner found. 3 versions made.",
  failed: "Winner found. Couldn't make the versions.",
};

const BUSY = "Your other remix is still going. This one can start once it's done.";

const firstLine = (d: DraftEntry) => {
  const line = (d.hook || toPlainText(d.draft).split("\n").find((l) => l.trim()) || "").trim();
  return line.length > 80 ? `${line.slice(0, 77).trimEnd()}...` : line;
};

/** "\"{first line}\" got {n}x your usual engagement on {network}." */
export function winnerLine(c: Card): string {
  const network = labelForDimension("platform", c.winner.network);
  const name = `"${firstLine(c.winner.draft)}"`;
  return c.winner.ratio === null ? `${name} got ${c.winner.engagements.toLocaleString()} engagements on ${network}.` : `${name} got ${c.winner.ratio}x your usual engagement on ${network}.`;
}

/** The Winner found cards for the open brand, or nothing. `drafts`: the brand's drafts as the page last read them. */
export default function WinnerCard({ userId, drafts, now = Date.now }: { userId: string; drafts: DraftEntry[]; now?: () => number }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [busy, setBusy] = useState<string | null>(null);
  const cards = winnerCards(userId, drafts, now());
  const making = cards.some((c) => c.status === "making");
  const left = useUsesLeft(making)("remix-make");
  const update = useUrlUpdate();

  useEffect(() => onWinners(redraw), []);
  // free: measured on the device, then Jev's evergreen check (winner-check, 5 a day); nothing is made here
  useEffect(() => {
    void checkWinners(userId, drafts, now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, drafts]);

  if (!cards.length) return null;

  const make = (c: Card) => {
    const id = c.winner.draft.id;
    // the day's checks or remixes are used: the Remix sheet with 3 versions picked says what is left
    if (c.status === "limit" || (left !== null && left < 3)) return update({ remix: sourceKey.own(id), versions: "3" }, { push: true });
    const r = makeWinnerVersions(userId, id, now);
    setBusy(r === "busy" ? id : null);
  };
  const undo = (c: Card) => {
    const gone = undoWinner(userId, c.winner.draft.id);
    toast({ title: gone ? "Versions removed" : "Those versions were changed or scheduled, so they stay." });
  };

  return (
    <div id="winners" className="scroll-mt-20 space-y-2">
      {cards.map((c) => {
        const id = c.winner.draft.id;
        const offer = c.status === "ready" || c.status === "limit" || c.status === "failed";
        return (
          <div key={id} className="space-y-2 rounded-xl border border-primary/30 bg-primary/[0.05] p-3 shadow-card">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {c.status === "making" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
              </span>
              <h3 className="text-sm font-semibold text-foreground" aria-live="polite">
                {HEADING[c.status]}
              </h3>
              <InfoTip label="About Winner found">Twice your usual engagement, posted in the last 30 days.</InfoTip>
            </div>
            <p className="text-sm text-muted-foreground">{winnerLine(c)}</p>
            {busy === id && c.status !== "making" && <p className="text-sm text-muted-foreground">{BUSY}</p>}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {c.status === "made" && c.setId && (
                <>
                  <Button asChild size="sm" className="[@media(pointer:coarse)]:h-11">
                    <Link to={links.drafts({ set: c.setId })}>See the versions</Link>
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => undo(c)} className="[@media(pointer:coarse)]:h-11">
                    Undo
                  </Button>
                </>
              )}
              {offer && (
                <>
                  <Button type="button" size="sm" onClick={() => make(c)} className="[@media(pointer:coarse)]:h-11">
                    {c.status === "failed" ? "Try again" : "Make 3 versions"}
                  </Button>
                  <PriceChip feature="remix-make" left={left} uses={3} />
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
