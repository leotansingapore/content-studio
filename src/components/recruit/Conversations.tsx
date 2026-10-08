import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DM_RULES,
  FIVE_QUESTIONS,
  REFERRAL_ASK,
  REPLY_ANSWERS,
  SEND_TEN_SCRIPT,
  WHO_NOT,
  WHO_TO_ASK,
} from "@/data/recruitKit";
import { personalisedScript, type RecruitBrain } from "@/lib/recruit";
import { CopyButton, Part } from "./shared";

type Update = (fn: (b: RecruitBrain) => RecruitBrain) => void;
type Row = RecruitBrain["conversations"][number];

export default function Conversations({ brain, update, done }: { brain: RecruitBrain; update: Update; done: boolean }) {
  const script = useMemo(() => personalisedScript(SEND_TEN_SCRIPT, brain.icp), [brain.icp]);
  const rows = brain.conversations;
  const counts = {
    sent: rows.filter((r) => r.sent).length,
    replied: rows.filter((r) => r.replied).length,
    booked: rows.filter((r) => r.booked).length,
  };
  const trifectaNames = brain.trifecta.map((t) => t.name.trim()).filter(Boolean);
  const missingTrifecta = trifectaNames.filter((n) => !rows.some((r) => r.name.trim().toLowerCase() === n.toLowerCase()));

  const setRow = (i: number, patch: Partial<Row>) =>
    update((b) => ({ ...b, conversations: b.conversations.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  const addTrifecta = () =>
    update((b) => {
      const names = [...missingTrifecta];
      return {
        ...b,
        conversations: b.conversations.map((r) => (!r.name.trim() && names.length ? { ...r, name: names.shift()! } : r)),
      };
    });

  return (
    <div className="space-y-5">
      <Part n={3} title="Ten conversations" question="Will you actually talk to me?" done={done}
        tip="Come as a researcher, not a recruiter. Their words become your next posts.">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">The script</p>
            <CopyButton text={script} label="Copy" what="Script copied" />
          </div>
          <p className="mt-1 text-sm leading-relaxed text-foreground">{script}</p>
          <p className="mt-2 text-[11px] text-muted-foreground">Personalise the first line, keep the rest. WhatsApp or LinkedIn.</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span><span className="font-semibold">{counts.sent}</span>/10 sent</span>
          <span><span className="font-semibold">{counts.replied}</span> replied</span>
          <span><span className="font-semibold">{counts.booked}</span> chats booked</span>
          {missingTrifecta.length > 0 && (
            <Button size="sm" variant="outline" className="ml-auto h-8 text-xs" onClick={addTrifecta}>
              Add my Trifecta names first
            </Button>
          )}
        </div>

        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={i} className="rounded-xl border border-border/60 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-5 text-right font-mono text-xs text-muted-foreground">{i + 1}</span>
                <Input
                  value={r.name}
                  onChange={(e) => setRow(i, { name: e.target.value })}
                  placeholder="Name"
                  aria-label={`Conversation ${i + 1} name`}
                  className="h-9 min-w-0 flex-1 basis-40"
                />
                <div className="flex gap-1">
                  {(["sent", "replied", "booked"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={r[k]}
                      onClick={() => setRow(i, { [k]: !r[k] })}
                      className={`h-9 rounded-lg border px-2.5 text-[11px] font-semibold transition-colors ${
                        r[k] ? "border-success/50 bg-success/10 text-success" : "border-border/60 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {k === "booked" ? "Chat booked" : k[0].toUpperCase() + k.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {(r.replied || r.words) && (
                <Input
                  value={r.words}
                  onChange={(e) => setRow(i, { words: e.target.value })}
                  placeholder="Their words worth quoting"
                  aria-label={`Conversation ${i + 1} words worth quoting`}
                  className="mt-2 h-9"
                />
              )}
            </li>
          ))}
        </ol>

        <div className="grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Who to ask</p>
            <ul className="space-y-0.5">
              {WHO_TO_ASK.map((w) => (
                <li key={w.group}><span className="font-semibold">{w.group}</span> <span className="text-muted-foreground">{w.why}</span></li>
              ))}
            </ul>
            <p className="mt-1 text-muted-foreground">{WHO_NOT}</p>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">In the 20 minutes</p>
              <CopyButton text={[...FIVE_QUESTIONS.map((q, i) => `${i + 1}. ${q}`), "", REFERRAL_ASK].join("\n")} label="Copy" what="Questions copied" />
            </div>
            <ol className="list-decimal space-y-0.5 pl-4">
              {FIVE_QUESTIONS.map((q) => <li key={q}>{q}</li>)}
            </ol>
            <p className="mt-1 italic text-muted-foreground">Then: &ldquo;{REFERRAL_ASK}&rdquo;</p>
          </div>
        </div>
      </Part>

      <Part n="R" title="When they reply" tip="A reply is an invitation to talk, not a yes. Never put income figures in writing.">
        <ul className="space-y-2">
          {REPLY_ANSWERS.map((r) => (
            <li key={r.q} className="rounded-xl border border-border/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold">&ldquo;{r.q}&rdquo;</p>
                <CopyButton text={r.a} label="Copy" what="Answer copied" />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{r.a}</p>
            </li>
          ))}
        </ul>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Six rules for candidate DMs</p>
          <ul className="grid gap-1.5 text-xs sm:grid-cols-2">
            {DM_RULES.map((d, i) => (
              <li key={d.rule}><span className="font-semibold">{i + 1}. {d.rule}:</span> <span className="text-muted-foreground">{d.example}</span></li>
            ))}
          </ul>
        </div>
      </Part>
    </div>
  );
}
