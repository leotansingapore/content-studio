// Replies to direct messages. Many messages: Jev sorts them into leads,
// recruiters, peers, favours and spam and flags automated sequences; only the
// ones worth answering get a draft. One conversation: the consultant marks
// which lines are theirs (never guessed) and one draft answers the latest
// message. Both steer to the goal picked, remembered per profile. Every draft
// is copied out and sent by hand.
import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_ITEMS,
  MAX_THREAD,
  loadGoal,
  saveGoal,
  splitPasted,
  threadLines,
  toggleMine,
  type DmGoal,
  type DmItem,
  type DmKind,
  type ThreadItem,
} from "@/lib/engageDrafts";
import { Draft, Groups, Quote, RunStatus, useEngageRun } from "./shared";

const KINDS: { kind: DmKind; label: string; tip?: string }[] = [
  { kind: "lead", label: "Leads", tip: "Reply today. Nothing personal is advised before you meet." },
  { kind: "recruiter", label: "Recruiters" },
  { kind: "peer", label: "Peers" },
  { kind: "favour", label: "Favours" },
  { kind: "unsorted", label: "Not sorted", tip: "Mostly not in English, or the sorting was unavailable, so it is in the order you pasted." },
];

const VIEWS = [
  { id: "batch", label: "Many messages" },
  { id: "thread", label: "One conversation" },
] as const;
type View = (typeof VIEWS)[number]["id"];

const GOALS: { id: DmGoal; label: string }[] = [
  { id: "call", label: "Book a call" },
  { id: "guide", label: "Send a guide" },
  { id: "rapport", label: "Build rapport" },
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Pills<T extends string>({ options, value, onPick, disabled, ...aria }: { options: readonly { id: T; label: string }[]; value: T; onPick: (id: T) => void; disabled: boolean; "aria-label"?: string; "aria-labelledby"?: string }) {
  return (
    <div role="group" {...aria} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onPick(o.id)}
          disabled={disabled}
          className={`h-11 rounded-full border px-3 text-xs font-medium transition-colors sm:h-8 [@media(pointer:coarse)]:h-11 ${
            value === o.id ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function Dms({ userId }: { userId: string }) {
  const batch = useEngageRun<DmItem>("dms", userId);
  const thread = useEngageRun<ThreadItem>("thread", userId);
  const [goal, setGoal] = useState<DmGoal>(() => loadGoal(userId));
  const view: View = batch.run.form.view === "thread" ? "thread" : "batch";
  const busy = view === "batch" ? batch.busy : thread.busy;

  const count = useMemo(() => splitPasted(batch.run.pasted).length, [batch.run.pasted]);
  const tooMany = count > MAX_ITEMS;
  const goBatch = () => !batch.busy && count && !tooMany && batch.start();
  const skipped = (x: DmItem) => x.kind === "spam" || x.automated;

  const lines = useMemo(() => threadLines(thread.run.pasted, thread.run.form.mine), [thread.run.pasted, thread.run.form.mine]);
  const first = Math.max(0, lines.length - MAX_THREAD);
  const lastIsMine = lines.length > 0 && lines[lines.length - 1].me;
  const goThread = () => !thread.busy && lines.length && !lastIsMine && thread.start();
  const reply = thread.run.items[0];

  return (
    <section className="space-y-4" aria-labelledby="dms-title">
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <h2 id="dms-title" className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
            <Inbox className="h-4 w-4 text-primary" /> Reply to your DMs
          </h2>
          <Pills aria-label="What you are pasting" options={VIEWS} value={view} onPick={(v) => batch.edit({ form: { ...batch.run.form, view: v } })} disabled={busy} />

          {view === "batch" ? (
            <div className="space-y-1.5">
              <Label htmlFor="dms-messages">The messages, a blank line between each</Label>
              <Textarea
                id="dms-messages"
                value={batch.run.pasted}
                onChange={(e) => batch.edit({ pasted: e.target.value })}
                readOnly={batch.busy}
                rows={8}
                placeholder={"Karen: How much would it cost to cover my kids?\n\nLeadGen Pro: Quick question"}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="dms-thread">The conversation, oldest first</Label>
                <Textarea
                  id="dms-thread"
                  value={thread.run.pasted}
                  onChange={(e) => thread.edit({ pasted: e.target.value })}
                  readOnly={thread.busy}
                  rows={6}
                  placeholder={"Karen: Hi, saw your post on hospital plans\nThanks Karen, what made you look into it?\nKaren: My dad's premium just jumped"}
                />
              </div>
              {lines.length > 0 && (
                <div className="space-y-1.5" data-testid="thread-lines">
                  <p className="flex items-center gap-1 text-xs font-medium text-foreground">
                    Who said it
                    <InfoTip label="About who said it">Tap to switch. A name switches every line with it.</InfoTip>
                  </p>
                  <ol className="space-y-1">
                    {lines.slice(first).map((l, k) => {
                      const j = first + k;
                      return (
                        <li key={j} className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-pressed={l.me}
                            aria-label={`Message ${j + 1}: ${l.me ? "yours" : "theirs"}. Switch`}
                            onClick={() => thread.edit({ form: { ...thread.run.form, mine: toggleMine(lines, j) } })}
                            disabled={thread.busy}
                            className={`inline-flex h-11 w-16 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors sm:h-8 [@media(pointer:coarse)]:h-11 ${
                              l.me ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/40"
                            }`}
                          >
                            {l.me ? "You" : "Them"}
                          </button>
                          <p className={`line-clamp-2 min-w-0 flex-1 text-sm [overflow-wrap:anywhere] ${l.me ? "text-muted-foreground" : "text-foreground"}`}>
                            {l.name && <span className="font-semibold">{l.name}: </span>}
                            {l.text}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                  {first > 0 && <p className="text-[11px] text-muted-foreground">Reads the last {MAX_THREAD} messages.</p>}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <p id="dms-goal" className="text-xs font-medium text-foreground">{view === "batch" ? "Steer leads toward" : "Steer toward"}</p>
            <Pills aria-labelledby="dms-goal" options={GOALS} value={goal} onPick={(g) => setGoal(saveGoal(userId, g))} disabled={busy} />
          </div>

          {view === "batch" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={goBatch} disabled={batch.busy || !count || tooMany} className="h-11 gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95 sm:h-10">
                Sort and draft replies
              </Button>
              <span className={`ml-auto text-[11px] tabular-nums ${tooMany ? "font-medium text-warning" : "text-muted-foreground"}`}>
                {tooMany ? `${count} messages: up to ${MAX_ITEMS} at a time` : plural(count, "message")}
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={goThread} disabled={thread.busy || !lines.length || lastIsMine} className="h-11 gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95 sm:h-10">
                Draft my reply
              </Button>
              <span className={`ml-auto text-[11px] ${lastIsMine ? "font-medium text-warning" : "tabular-nums text-muted-foreground"}`}>
                {lastIsMine ? "The last message is yours. Wait for their reply." : plural(lines.length, "message")}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {view === "batch" ? (
        <>
          <RunStatus busy={batch.busy} busyText={`Sorting ${plural(count, "message")} and drafting replies...`} outcome={batch.outcome} retry={goBatch} />
          {!batch.busy && (
            <Groups
              testId="dms-run"
              groups={[
                ...KINDS.map((k) => ({ key: k.kind, label: k.label, tip: k.tip, items: batch.run.items.filter((x) => x.kind === k.kind && !skipped(x)) })),
                { key: "spam", label: "Spam and automated", tip: "No reply needed. You don't owe a reply to a script.", items: batch.run.items.filter(skipped) },
              ]}
              render={(x) => (
                <li key={x.i} className="space-y-2 rounded-xl border border-border/60 bg-card p-3">
                  <Quote name={x.name} text={x.text} tag={x.automated ? "Automated" : undefined} />
                  {x.reply !== null && <Draft label="Reply" text={x.reply} />}
                </li>
              )}
            />
          )}
        </>
      ) : (
        <>
          <RunStatus busy={thread.busy} busyText="Reading the conversation and drafting your reply..." outcome={thread.outcome} retry={goThread} />
          {!thread.busy && reply && (
            <div className="space-y-2 rounded-xl border border-border/60 bg-card p-3" data-testid="thread-run">
              <Quote name={reply.name} text={reply.text} />
              <Draft label="Reply" text={reply.reply} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
