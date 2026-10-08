// Replies to the comments under your own post: Jev sorts them, the drafts come
// back clients first, and each one is copied out and posted by hand.
import { useEffect, useMemo, useState } from "react";
import { MessageSquareReply } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_ITEMS,
  MAX_POST_CHARS,
  loadRun,
  runningJob,
  saveRun,
  splitPasted,
  startReplies,
  type CommentKind,
  type EngageOutcome,
  type RepliesRun,
  type ReplyItem,
} from "@/lib/engageDrafts";
import { Draft, RunStatus } from "./shared";

const KINDS: Record<CommentKind, { label: string; tip?: string }> = {
  client: { label: "Potential clients", tip: "Answer these first. The DM is where anything personal or a link goes." },
  substantive: { label: "Adds something" },
  peer: { label: "Peers" },
  support: { label: "Support" },
  unsorted: { label: "Not sorted", tip: "Mostly not in English, or the sorting was unavailable, so it is in the order you pasted." },
  noise: { label: "Noise", tip: "No reply: a reply gives it more reach." },
};
const ORDER: CommentKind[] = ["client", "substantive", "peer", "support", "unsorted", "noise"];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function Replies({ userId }: { userId: string }) {
  const [run, setRun] = useState<RepliesRun>(() => loadRun("replies", userId));
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<EngageOutcome | null>(null);
  const count = useMemo(() => splitPasted(run.pasted).length, [run.pasted]);
  const tooMany = count > MAX_ITEMS;

  const follow = (job: Promise<EngageOutcome>) => {
    setBusy(true);
    setOutcome(null);
    let live = true;
    job.then((o) => {
      if (!live) return;
      setBusy(false);
      setOutcome(o);
      setRun(loadRun("replies", userId));
    });
    return () => {
      live = false;
    };
  };

  // A run started before leaving the page is picked up again on return.
  useEffect(() => {
    setRun(loadRun("replies", userId));
    const job = runningJob("replies", userId);
    return job ? follow(job) : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const edit = (patch: Partial<RepliesRun>) => setRun((r) => saveRun("replies", userId, { ...r, ...patch }));
  const go = () => {
    if (busy || !count || tooMany) return;
    follow(startReplies(userId, run.post, run.pasted));
  };

  const groups = ORDER.map((k) => ({ kind: k, items: run.items.filter((x) => x.kind === k) })).filter((g) => g.items.length);

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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={go}
              disabled={busy || !count || tooMany}
              className="h-11 gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95 sm:h-10"
            >
              Sort and draft replies
            </Button>
            <span className={`ml-auto text-[11px] tabular-nums ${tooMany ? "font-medium text-warning" : "text-muted-foreground"}`}>
              {tooMany ? `${count} comments: up to ${MAX_ITEMS} at a time` : plural(count, "comment")}
            </span>
          </div>
        </CardContent>
      </Card>

      <RunStatus busy={busy} busyText={`Sorting ${plural(count, "comment")} and drafting replies...`} outcome={outcome} retry={go} />

      {!busy && groups.length > 0 && (
        <div className="space-y-4" data-testid="replies-run">
          <p className="flex flex-wrap gap-1.5" aria-label="How the comments sorted">
            {groups.map((g) => (
              <span key={g.kind} className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                {KINDS[g.kind].label} <span className="tabular-nums text-foreground">{g.items.length}</span>
              </span>
            ))}
          </p>
          {groups.map((g) => (
            <div key={g.kind} className="space-y-2">
              <h3 className="flex items-center gap-1 text-sm font-semibold text-foreground">
                {KINDS[g.kind].label}
                {KINDS[g.kind].tip && <InfoTip label={`About ${KINDS[g.kind].label}`}>{KINDS[g.kind].tip}</InfoTip>}
              </h3>
              <ul className="space-y-2">
                {g.items.map((x) => (
                  <ReplyCard key={x.i} item={x} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ReplyCard({ item }: { item: ReplyItem }) {
  return (
    <li className="space-y-2 rounded-xl border border-border/60 bg-card p-3">
      <p className="line-clamp-3 text-sm text-muted-foreground [overflow-wrap:anywhere]">
        {item.name && <span className="font-semibold text-foreground">{item.name}: </span>}
        {item.text}
      </p>
      {item.reply !== null && <Draft label="Reply" text={item.reply} />}
      {item.dm !== undefined && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Then DM them</p>
          <Draft label="DM" text={item.dm} />
        </div>
      )}
    </li>
  );
}
