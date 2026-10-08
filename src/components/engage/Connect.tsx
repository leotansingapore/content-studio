// A LinkedIn connection note under 200 characters with a live count, the first
// message after they accept and two follow-ups, timed at 4 and 10 days and
// added to your calendar with one tap. You send each one by hand.
import { useState } from "react";
import { CalendarCheck, CalendarPlus, Copy, UserRoundPlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import DayInput from "@/components/DayInput";
import { useCopy } from "@/components/recruit/shared";
import { addDays, keyToDate, localDateKey } from "@/lib/dueDates";
import { loadNotes, newNoteId, saveNote, type CalNote } from "@/lib/calendarNotes";
import { NOTE_MAX, followUpDates, followUpTitle, type ConnectDrafts, type ConnectGoal } from "@/lib/engageDrafts";
import { Draft, RunStatus, useEngageRun } from "./shared";

const GOALS: { id: ConnectGoal; label: string }[] = [
  { id: "know", label: "Get to know them" },
  { id: "recruit", label: "Recruit them" },
  { id: "client", label: "Win a client" },
  { id: "referral", label: "Swap referrals" },
];
const DAY = new Intl.DateTimeFormat("en-SG", { weekday: "short", day: "numeric", month: "short" });
const dayLabel = (key: string) => DAY.format(keyToDate(key));

export default function Connect({ userId }: { userId: string }) {
  const { run, busy, outcome, edit, start } = useEngageRun<ConnectDrafts>("connect", userId);
  const [notes, setNotes] = useState<CalNote[]>(() => loadNotes(userId));
  const copy = useCopy();
  const f = run.form;
  const setField = (k: string, v: string) => edit({ form: { ...f, [k]: v } });
  const ready = Boolean(f.name?.trim() && f.reason?.trim());
  const go = () => !busy && ready && start();
  const d = run.items[0];
  const today = localDateKey();
  const accepted = f.accepted || today;
  const when = followUpDates(accepted);
  const noteLen = d?.note.length ?? 0;
  const name = f.name?.trim() ?? "";

  const onCalendar = (date: string, title: string) => notes.some((n) => n.date === date && n.title === title);
  const addToCalendar = (date: string, title: string) => setNotes(saveNote(userId, { id: newNoteId(), date, title, color: "primary" }));

  const followUp = (n: 1 | 2, date: string, text: string) => {
    const title = followUpTitle(name || "them", n);
    const added = onCalendar(date, title);
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Follow-up, day {n === 1 ? 4 : 10} <span className="normal-case tracking-normal text-foreground">{dayLabel(date)}</span>
          </p>
          <button
            type="button"
            onClick={() => !added && addToCalendar(date, title)}
            disabled={added}
            className={`inline-flex h-11 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold transition-colors sm:h-8 ${
              added ? "text-success" : "text-primary hover:bg-primary/10"
            }`}
          >
            {added ? <CalendarCheck className="h-3.5 w-3.5" /> : <CalendarPlus className="h-3.5 w-3.5" />}
            {added ? "On your calendar" : "Add to calendar"}
          </button>
        </div>
        <Draft label="Follow-up" text={text} />
      </div>
    );
  };

  return (
    <section className="space-y-4" aria-labelledby="connect-title">
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <h2 id="connect-title" className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
            <UserRoundPlus className="h-4 w-4 text-primary" /> Connection note and follow-ups
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="connect-name">Who</Label>
              <Input id="connect-name" value={f.name ?? ""} onChange={(e) => setField("name", e.target.value)} readOnly={busy} maxLength={60} className="h-11 sm:h-10" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="connect-about">Role or company (optional)</Label>
              <Input id="connect-about" value={f.about ?? ""} onChange={(e) => setField("about", e.target.value)} readOnly={busy} maxLength={200} className="h-11 sm:h-10" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="connect-reason">Why them, why now</Label>
            <Textarea
              id="connect-reason"
              value={f.reason ?? ""}
              onChange={(e) => setField("reason", e.target.value)}
              readOnly={busy}
              rows={2}
              maxLength={500}
              placeholder="Her post last week about leaving teaching after 8 years"
            />
          </div>
          <div role="group" aria-label="What you want" className="flex flex-wrap gap-1.5">
            {GOALS.map((g) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={(f.goal || "know") === g.id}
                onClick={() => setField("goal", g.id)}
                disabled={busy}
                className={`h-11 rounded-full border px-3 text-xs font-medium transition-colors sm:h-8 ${
                  (f.goal || "know") === g.id ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
          <Button onClick={go} disabled={busy || !ready} className="h-11 gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95 sm:h-10">
            Write the note and follow-ups
          </Button>
        </CardContent>
      </Card>

      <RunStatus busy={busy} busyText="Writing the note, the first message and two follow-ups..." outcome={outcome} retry={go} />

      {!busy && d && (
        <Card className="border-border/60 shadow-card" data-testid="connect-run">
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="connect-note" className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Connection note
                </Label>
                <span className={`text-[11px] tabular-nums ${noteLen > NOTE_MAX ? "font-semibold text-destructive" : "text-muted-foreground"}`} aria-live="polite">
                  {noteLen}/{NOTE_MAX}
                </span>
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-1.5">
                <Textarea
                  id="connect-note"
                  value={d.note}
                  onChange={(e) => edit({ items: [{ ...d, note: e.target.value }] })}
                  rows={3}
                  className="min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-1"
                />
                <button
                  type="button"
                  onClick={() => copy(d.note, "Note copied")}
                  aria-label="Copy note"
                  className="inline-flex h-11 shrink-0 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10 sm:h-8"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
              </div>
              {noteLen > NOTE_MAX && <p className="text-[11px] text-destructive">LinkedIn stops a note at {NOTE_MAX} characters. Cut {noteLen - NOTE_MAX}.</p>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="connect-accepted" className="text-sm">They accepted on</Label>
              <DayInput
                id="connect-accepted"
                value={accepted}
                min={addDays(today, -90)}
                onPick={(day) => setField("accepted", day)}
                className="h-11 rounded-md border border-input bg-background px-3 text-sm sm:h-9"
              />
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                First message <span className="normal-case tracking-normal text-foreground">{dayLabel(when.first)}</span>
              </p>
              <Draft label="First message" text={d.first} />
            </div>
            {followUp(1, when.day4, d.follow4)}
            {followUp(2, when.day10, d.follow10)}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
