// Replies to direct messages: Jev sorts them into leads, recruiters, peers,
// favours and spam and flags automated sequences; only the ones worth
// answering get a draft, copied out and sent by hand.
import { useMemo } from "react";
import { Inbox } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_ITEMS, splitPasted, type DmItem, type DmKind } from "@/lib/engageDrafts";
import { Draft, Groups, Quote, RunStatus, useEngageRun } from "./shared";

const KINDS: { kind: DmKind; label: string; tip?: string }[] = [
  { kind: "lead", label: "Leads", tip: "Reply today. Nothing personal is advised before you meet." },
  { kind: "recruiter", label: "Recruiters" },
  { kind: "peer", label: "Peers" },
  { kind: "favour", label: "Favours" },
  { kind: "unsorted", label: "Not sorted", tip: "Mostly not in English, or the sorting was unavailable, so it is in the order you pasted." },
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function Dms({ userId }: { userId: string }) {
  const { run, busy, outcome, edit, start } = useEngageRun<DmItem>("dms", userId);
  const count = useMemo(() => splitPasted(run.pasted).length, [run.pasted]);
  const tooMany = count > MAX_ITEMS;
  const go = () => !busy && count && !tooMany && start();
  const skipped = (x: DmItem) => x.kind === "spam" || x.automated;

  return (
    <section className="space-y-4" aria-labelledby="dms-title">
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <h2 id="dms-title" className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
            <Inbox className="h-4 w-4 text-primary" /> Sort your DMs
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="dms-messages">The messages, a blank line between each</Label>
            <Textarea
              id="dms-messages"
              value={run.pasted}
              onChange={(e) => edit({ pasted: e.target.value })}
              readOnly={busy}
              rows={8}
              placeholder={"Karen: How much would it cost to cover my kids?\n\nLeadGen Pro: Quick question"}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={go} disabled={busy || !count || tooMany} className="h-11 gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95 sm:h-10">
              Sort and draft replies
            </Button>
            <span className={`ml-auto text-[11px] tabular-nums ${tooMany ? "font-medium text-warning" : "text-muted-foreground"}`}>
              {tooMany ? `${count} messages: up to ${MAX_ITEMS} at a time` : plural(count, "message")}
            </span>
          </div>
        </CardContent>
      </Card>

      <RunStatus busy={busy} busyText={`Sorting ${plural(count, "message")} and drafting replies...`} outcome={outcome} retry={go} />

      {!busy && (
        <Groups
          testId="dms-run"
          groups={[
            ...KINDS.map((k) => ({ key: k.kind, label: k.label, tip: k.tip, items: run.items.filter((x) => x.kind === k.kind && !skipped(x)) })),
            { key: "spam", label: "Spam and automated", tip: "No reply needed. You don't owe a reply to a script.", items: run.items.filter(skipped) },
          ]}
          render={(x) => (
            <li key={x.i} className="space-y-2 rounded-xl border border-border/60 bg-card p-3">
              <Quote name={x.name} text={x.text} tag={x.automated ? "Automated" : undefined} />
              {x.reply !== null && <Draft label="Reply" text={x.reply} />}
            </li>
          )}
        />
      )}
    </section>
  );
}
