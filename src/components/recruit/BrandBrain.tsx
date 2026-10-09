import { useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import {
  CANDIDATE_TYPES,
  CAPCUT_STEPS,
  FOUR_FIXES,
  PATHWAYS,
  STARL,
  STORY_STARTERS,
  STORY_TARGET_WORDS,
  TRIFECTA,
} from "@/data/recruitKit";
import {
  centreCandidate,
  scanRecruitCompliance,
  storyText,
  wordCount,
  type RecruitBrain,
} from "@/lib/recruit";
import { CopyButton, Flags, Part } from "./shared";

type Update = (fn: (b: RecruitBrain) => RecruitBrain) => void;

const SCORES = [0, 1, 2, 3, 4, 5];

export default function BrandBrain({ brain, update, done }: { brain: RecruitBrain; update: Update; done: Record<string, boolean> }) {
  const [typeOpen, setTypeOpen] = useState<string | null>(null);
  const centre = centreCandidate(brain.trifecta);
  const pathway = PATHWAYS.find((p) => p.id === brain.pathway);
  const story = storyText(brain.story);
  const words = wordCount(story);
  const storyFlags = useMemo(() => scanRecruitCompliance(story), [story]);
  const promiseFlags = useMemo(() => scanRecruitCompliance(brain.promise), [brain.promise]);
  const proofFlags = useMemo(() => scanRecruitCompliance(brain.proof), [brain.proof]);

  const setRow = (i: number, patch: Partial<RecruitBrain["trifecta"][number]>) =>
    update((b) => ({ ...b, trifecta: b.trifecta.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  return (
    <div className="space-y-5">
      <Part id="part-1" n={1} title="One candidate" question="Is this for someone like me?" done={done.candidate}
        tip="Score 3 real people. The one in the centre of all three is your ONE candidate.">
        <div className="space-y-2">
          <div className="hidden grid-cols-[1fr_repeat(3,7.5rem)] gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:grid">
            <span>Real person</span>
            {TRIFECTA.map((t) => (
              <span key={t.key}>
                {t.label}
                <span className="block text-[10px] font-normal normal-case tracking-normal">{t.ask}</span>
              </span>
            ))}
          </div>
          {brain.trifecta.map((r, i) => (
            <div
              key={i}
              className={`grid grid-cols-3 gap-2 rounded-xl p-1.5 sm:grid-cols-[1fr_repeat(3,7.5rem)] ${centre === r ? "bg-primary/5 ring-1 ring-primary/30" : ""}`}
            >
              <Input
                value={r.name}
                onChange={(e) => setRow(i, { name: e.target.value })}
                placeholder={`Real person ${i + 1}`}
                aria-label={`Person ${i + 1} name`}
                className="col-span-3 h-9 [@media(pointer:coarse)]:h-11 sm:col-span-1"
              />
              {TRIFECTA.map((t) => (
                <label key={t.key} className="space-y-0.5">
                  <span className="block whitespace-nowrap text-[11px] font-semibold text-muted-foreground sm:hidden">{t.label}</span>
                  <select
                    value={r[t.key]}
                    onChange={(e) => setRow(i, { [t.key]: Number(e.target.value) })}
                    aria-label={`${r.name || `Person ${i + 1}`} ${t.label}`}
                    className="h-9 [@media(pointer:coarse)]:h-11 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {SCORES.map((s) => (
                      <option key={s} value={s}>{s === 0 ? "-" : `${s} / 5`}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          ))}
        </div>
        {centre && (
          <p className="text-sm">
            In the centre: <span className="font-semibold text-primary">{centre.name}</span>
          </p>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground" htmlFor="icp">
            My ICP: WHO they are + WHAT they want + the STRUGGLE I remove
          </label>
          <Textarea
            id="icp"
            rows={2}
            value={brain.icp}
            onChange={(e) => update((b) => ({ ...b, icp: e.target.value }))}
            placeholder="I help ... who want ... without ..."
          />
        </div>

        <div className="space-y-1.5">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Sharpen it, don't pick from it
            <InfoTip label="About candidate types">You can recruit anyone offline. Your content must be aimed at ONE.</InfoTip>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CANDIDATE_TYPES.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => setTypeOpen(typeOpen === t.name ? null : t.name)}
                aria-expanded={typeOpen === t.name}
                className={`inline-flex h-9 items-center rounded-full border px-3 text-[11px] font-medium transition-colors sm:h-7 [@media(pointer:coarse)]:h-11 ${
                  typeOpen === t.name ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
          {typeOpen && (
            <p className="text-xs text-muted-foreground">{CANDIDATE_TYPES.find((t) => t.name === typeOpen)?.line}</p>
          )}
        </div>
      </Part>

      <Part id="part-2" n={2} title="One promise" question="Why you, and not another leader?" done={done.promise}>
        <div className="grid gap-2 sm:grid-cols-3">
          {PATHWAYS.map((p) => {
            const active = brain.pathway === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => update((b) => ({ ...b, pathway: active ? "" : p.id }))}
                aria-pressed={active}
                className={`rounded-xl border p-3 text-left transition-all ${
                  active ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30" : "border-border/70 hover:border-primary/40"
                }`}
              >
                <span className="block text-sm font-semibold text-foreground">{p.label}</span>
                <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{p.line}</span>
              </button>
            );
          })}
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground" htmlFor="promise">
            My one line
          </label>
          <Input
            id="promise"
            value={brain.promise}
            onChange={(e) => update((b) => ({ ...b, promise: e.target.value }))}
            placeholder={pathway?.formula ?? "I help [ONE candidate] go from [before] to [after]."}
          />
          <Flags flags={promiseFlags} />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {(["linkedin", "instagram"] as const).map((k) => (
            <label key={k} className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={brain.promiseLive[k]}
                onChange={(e) => update((b) => ({ ...b, promiseLive: { ...b.promiseLive, [k]: e.target.checked } }))}
              />
              Live in my {k === "linkedin" ? "LinkedIn headline" : "Instagram bio"}
            </label>
          ))}
        </div>
      </Part>

      <Part n="V" title="Voice and proof" tip="Plain words. Short lines. One idea per post. Write the way you talk.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" htmlFor="voice-words">3 words people use to describe me</label>
            <Input id="voice-words" value={brain.voiceWords} placeholder="direct, warm, funny"
              onChange={(e) => update((b) => ({ ...b, voiceWords: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" htmlFor="phrases">Phrases I actually say</label>
            <Input id="phrases" value={brain.phrases} placeholder="2 to 3 phrases"
              onChange={(e) => update((b) => ({ ...b, phrases: e.target.value }))} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold" htmlFor="proof">
            Results I'm proud of: my path, my team's milestones, people I've grown. Facts only, no income figures.
          </label>
          <Textarea id="proof" rows={4} value={brain.proof} placeholder={"One fact per line, 3 to 5 of them"}
            onChange={(e) => update((b) => ({ ...b, proof: e.target.value }))} />
          <Flags flags={proofFlags} />
        </div>
      </Part>

      <Part id="part-4" n={4} title="One story" question="Can I trust you?" done={done.story}
        tip="STARL in 45 seconds. Phone vertical, captions on, eyes on the lens.">
        <div className="flex flex-wrap gap-1.5">
          {STORY_STARTERS.map((s) => (
            <span key={s.q} className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground">
              {s.q}: <span className="italic">{s.hint}</span>
            </span>
          ))}
        </div>
        <div className="space-y-3">
          {STARL.map((p) => (
            <div key={p.key} className="space-y-1">
              <label htmlFor={`starl-${p.key}`} className="flex items-baseline justify-between gap-2 text-xs font-semibold">
                <span>{p.label}</span>
                <span className="font-mono text-[10px] font-normal text-muted-foreground">{p.time}</span>
              </label>
              <Textarea
                id={`starl-${p.key}`}
                rows={2}
                value={brain.story[p.key]}
                placeholder={p.say}
                onChange={(e) => update((b) => ({ ...b, story: { ...b.story, [p.key]: e.target.value } }))}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`text-xs font-semibold ${words > STORY_TARGET_WORDS + 15 ? "text-warning" : "text-muted-foreground"}`}>
            {words} / ~{STORY_TARGET_WORDS} words (45 seconds)
          </span>
          {story && <CopyButton text={story} label="Copy script" what="Script copied" />}
        </div>
        <Flags flags={storyFlags} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">The 4 fixes before you post</p>
            {FOUR_FIXES.map((f, i) => (
              <label key={f} className="flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  checked={brain.fixesDone[i] ?? false}
                  onChange={(e) =>
                    update((b) => ({ ...b, fixesDone: FOUR_FIXES.map((_, j) => (j === i ? e.target.checked : b.fixesDone[j] ?? false)) }))
                  }
                />
                {f}
              </label>
            ))}
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Film it in CapCut</p>
            <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
              {CAPCUT_STEPS.map((s) => <li key={s}>{s}</li>)}
            </ol>
          </div>
        </div>
      </Part>
    </div>
  );
}
