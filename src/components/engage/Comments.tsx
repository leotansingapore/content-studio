// Comments on other people's posts: paste one post for two comments of
// different kinds, or up to 10 for one each. Jev picks the kinds, the LLM
// writes. Copying a comment notes whose post it was, so you can see who you
// commented on this week and spread it around.
import { useMemo, useState } from "react";
import { MessageSquarePlus, Plus, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_POSTS,
  MAX_POST_CHARS,
  loadLog,
  logComment,
  thisWeek,
  timesThisWeek,
  unlog,
  type CommentItem,
  type CommentType,
  type LogEntry,
  type Pasted,
} from "@/lib/engageDrafts";
import { Draft, Quote, RunStatus, useEngageRun } from "./shared";

const TYPES: Record<CommentType, string> = {
  number: "Add a number",
  question: "Ask the real question",
  disagree: "Respectfully disagree",
  result: "Share your result",
};
/** Seen this often this week, it starts to look like a habit. */
const OFTEN = 3;
const DAY = new Intl.DateTimeFormat("en-SG", { weekday: "short" });

export default function Comments({ userId }: { userId: string }) {
  const { run, busy, outcome, edit, start } = useEngageRun<CommentItem>("comments", userId);
  const [log, setLog] = useState<LogEntry[]>(() => loadLog(userId));
  const week = useMemo(() => thisWeek(log), [log]);
  const slots: Pasted[] = run.posts.length ? run.posts : [{ name: "", text: "" }];
  const filled = slots.filter((p) => p.text.trim()).length;
  const go = () => !busy && filled && start();

  const setSlot = (i: number, patch: Partial<Pasted>) => edit({ posts: slots.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  return (
    <section className="space-y-4" aria-labelledby="comments-title">
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <h2 id="comments-title" className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
            <MessageSquarePlus className="h-4 w-4 text-primary" /> Comment on someone's post
            <InfoTip label="About comments">One post gets two comments of different kinds. Two or more get one each.</InfoTip>
          </h2>
          <ol className="space-y-3">
            {slots.map((p, i) => {
              const seen = timesThisWeek(log, p.name);
              return (
                <li key={i} className="space-y-1.5 rounded-xl border border-border/60 p-3">
                  <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <Label htmlFor={`comment-name-${i}`}>Whose post</Label>
                      <Input id={`comment-name-${i}`} value={p.name} onChange={(e) => setSlot(i, { name: e.target.value })} readOnly={busy} maxLength={60} className="h-11 sm:h-9" />
                    </div>
                    {slots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => edit({ posts: slots.filter((_, j) => j !== i) })}
                        disabled={busy}
                        aria-label={`Remove post ${i + 1}`}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground sm:h-9 sm:w-9"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {seen > 0 && (
                    <p className={`text-[11px] ${seen >= OFTEN ? "font-medium text-warning" : "text-muted-foreground"}`}>
                      You commented on {p.name.trim()} {seen === 1 ? "once" : `${seen} times`} this week.
                    </p>
                  )}
                  <Label htmlFor={`comment-post-${i}`} className="sr-only">Their post</Label>
                  <Textarea
                    id={`comment-post-${i}`}
                    value={p.text}
                    onChange={(e) => setSlot(i, { text: e.target.value })}
                    readOnly={busy}
                    rows={slots.length > 1 ? 3 : 6}
                    maxLength={MAX_POST_CHARS}
                    placeholder="Paste their post"
                  />
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={go} disabled={busy || !filled} className="h-11 gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95 sm:h-10">
              {slots.length > 1 ? "Write a comment for each" : "Write 2 comments"}
            </Button>
            {slots.length < MAX_POSTS && (
              <Button variant="outline" onClick={() => edit({ posts: [...slots, { name: "", text: "" }] })} disabled={busy} className="h-11 gap-1.5 sm:h-10">
                <Plus className="h-4 w-4" /> Add another post
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <RunStatus busy={busy} busyText={filled > 1 ? `Writing a comment for each of ${filled} posts...` : "Writing 2 comments..."} outcome={outcome} retry={go} />

      {!busy && run.items.length > 0 && (
        <ul className="space-y-3" data-testid="comments-run">
          {run.items.map((x) => (
            <li key={x.i} className="space-y-2 rounded-xl border border-border/60 bg-card p-3">
              <Quote name={x.name} text={x.text} tag={x.sorted ? undefined : "Not sorted"} />
              {x.comments.map((c) => (
                <div key={c.type} className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{TYPES[c.type]}</p>
                  <Draft label="Comment" text={c.text} onCopy={() => setLog(logComment(userId, x.name, x.text))} />
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}

      {week.length > 0 && (
        <Card className="border-border/60 shadow-card" data-testid="comment-log">
          <CardContent className="space-y-2 p-4 sm:p-5">
            <h3 className="flex items-center gap-1 text-sm font-semibold text-foreground">
              Commented on this week <span className="tabular-nums text-muted-foreground">{week.length}</span>
              <InfoTip label="About this list">A comment you copy here counts. Remove one you didn't post.</InfoTip>
            </h3>
            <ul className="divide-y divide-border/60">
              {week.map((e) => (
                <li key={e.id} className="flex items-center gap-2 py-1">
                  <span className="w-9 shrink-0 text-[11px] text-muted-foreground">{DAY.format(new Date(e.at))}</span>
                  <p className="min-w-0 flex-1 truncate text-sm">
                    <span className={`font-semibold ${timesThisWeek(log, e.name) >= OFTEN ? "text-warning" : "text-foreground"}`}>{e.name || "No name"}</span>{" "}
                    <span className="text-muted-foreground">{e.post}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setLog(unlog(userId, e.id))}
                    aria-label={`Remove ${e.name || "this entry"}`}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground sm:h-8 sm:w-8"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
