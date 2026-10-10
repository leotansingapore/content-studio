// Replies to the comments under your own post: Jev sorts them, the drafts come
// back clients first, and each one is copied out and posted by hand. Ones to
// handle yourself come first with the reason and no draft; ones where a like
// is enough and ones worth hiding are marked (the app never likes or hides).
import { useMemo } from "react";
import { MessageSquareReply } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_ITEMS, MAX_POST_CHARS, splitPasted, type CommentKind, type ReplyItem } from "@/lib/engageDrafts";
import { Draft, Groups, HANDLE_YOURSELF, HandleYourselfTopics, Quote, RunStatus, useEngageRun } from "./shared";

const KINDS: { kind: CommentKind; label: string; tip?: string }[] = [
  { kind: "client", label: "Potential clients", tip: "Answer these first. The DM is where anything personal or a link goes." },
  { kind: "substantive", label: "Adds something" },
  { kind: "peer", label: "Peers" },
  { kind: "support", label: "A like is enough", tip: "Like it. The short reply is optional." },
  { kind: "unsorted", label: "Not sorted", tip: "Mostly not in English, or the sorting was unavailable, so it is in the order you pasted." },
  { kind: "noise", label: "Worth hiding", tip: "Spam or abuse: hide it on Instagram. A reply gives it reach." },
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function Replies({ userId }: { userId: string }) {
  const { run, busy, outcome, edit, start } = useEngageRun<ReplyItem>("replies", userId);
  const count = useMemo(() => splitPasted(run.pasted).length, [run.pasted]);
  const tooMany = count > MAX_ITEMS;
  const go = () => !busy && count && !tooMany && start();

  return (
    <section className="space-y-4" aria-labelledby="replies-title">
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <h2 id="replies-title" className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
            <MessageSquareReply className="h-4 w-4 text-primary" /> Reply to comments on your post
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="replies-post">Your post (optional)</Label>
            <Textarea id="replies-post" value={run.post} onChange={(e) => edit({ post: e.target.value })} readOnly={busy} rows={3} maxLength={MAX_POST_CHARS} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="replies-comments">The comments, a blank line between each</Label>
            <Textarea
              id="replies-comments"
              value={run.pasted}
              onChange={(e) => edit({ pasted: e.target.value })}
              readOnly={busy}
              rows={8}
              placeholder={"Sarah: Mine went up too. How do I check?\n\nTom: So true!"}
            />
          </div>
          <HandleYourselfTopics userId={userId} />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={go} disabled={busy || !count || tooMany} className="h-11 gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95 sm:h-10">
              Sort and draft replies
            </Button>
            <span className={`ml-auto text-[11px] tabular-nums ${tooMany ? "font-medium text-warning" : "text-muted-foreground"}`}>
              {tooMany ? `${count} comments: up to ${MAX_ITEMS} at a time` : plural(count, "comment")}
            </span>
          </div>
        </CardContent>
      </Card>

      <RunStatus busy={busy} busyText={`Sorting ${plural(count, "comment")} and drafting replies...`} outcome={outcome} retry={go} />

      {!busy && (
        <Groups
          testId="replies-run"
          groups={[
            { ...HANDLE_YOURSELF, items: run.items.filter((x) => x.escalate) },
            ...KINDS.map((k) => ({ key: k.kind, label: k.label, tip: k.tip, items: run.items.filter((x) => x.kind === k.kind && !x.escalate) })),
          ]}
          render={(x) => (
            <li key={x.i} className="space-y-2 rounded-xl border border-border/60 bg-card p-3">
              <Quote name={x.name} text={x.text} tag={x.escalate} />
              {x.reply !== null && <Draft userId={userId} label="Reply" text={x.reply} />}
              {x.dm !== undefined && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Then DM them</p>
                  <Draft userId={userId} label="DM" text={x.dm} />
                </div>
              )}
            </li>
          )}
        />
      )}
    </section>
  );
}
