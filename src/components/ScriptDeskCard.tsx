// The reel drawer's script tools on Clone a reel (script desk, wave 1, Leo only): Why it worked, two remixes (keep
// the idea, or keep the structure on a new topic) and Re-script with its claim check, each a script-desk job on
// Leo's Mac. A remix quotes the breakdown, so it makes one first when there is none. What came back, and a wait still
// running when the page was left, are kept per post on this device; the wait picks up again on return.

import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { DeskError, DeskWait, ScriptExtras, TOUCH, useDeskRun } from "@/components/ScriptDeskParts";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { scoped } from "@/lib/profiles";
import { pollDesk, runDesk, runRescript, saveScriptDraft, type Breakdown, type ClaimCheck, type Rescript, type Script } from "@/lib/scriptDesk";

interface Kept {
  /** When it was last written, so the device keeps only the newest KEEP_REELS. */
  at?: number;
  breakdown?: Breakdown;
  version?: Script & { mode: Mode };
  /** The re-script's job id (its claim check is filed on it) and the check, null until one came back. */
  rescript?: Rescript & { job?: string; check: ClaimCheck | null };
  /** A job still running when the page was left: which slot its answer goes in, and the remix's mode. */
  pending?: { job: string; slot: "breakdown" | "version" | "rescript" | "claims"; what: string; at: number; mode?: Mode };
}

type Mode = "same-idea" | "same-structure";

// the brand last, so removing a brand (profiles.ts removeProfile) takes these with it
const PREFIX = "cs-desk-reel-";
const keyOf = (userId: string, postId: string) => `${PREFIX}${postId}-${scoped(userId)}`;
const KEEP_REELS = 20;

/** Drops this brand's oldest reels past KEEP_REELS. */
function prune(userId: string) {
  const suffix = `-${scoped(userId)}`;
  const mine: [string, number][] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX) && k.endsWith(suffix)) mine.push([k, Number(JSON.parse(localStorage.getItem(k) ?? "{}")?.at) || 0]);
  }
  mine.sort((a, b) => b[1] - a[1]).slice(KEEP_REELS).forEach(([k]) => localStorage.removeItem(k));
}
const load = (k: string): Kept => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? "{}") ?? {};
  } catch {
    return {};
  }
};

export default function ScriptDeskCard({ userId, url, postId, hasWords }: { userId: string; url: string; postId: string; hasWords: boolean }) {
  const key = keyOf(userId, postId);
  const [kept, setKeptState] = useState<Kept>(() => load(key));
  const keep = (patch: Kept | ((cur: Kept) => Kept)) =>
    setKeptState((cur) => {
      const next = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch), at: Date.now() };
      try {
        localStorage.setItem(key, JSON.stringify(next));
        prune(userId);
      } catch {
        // full or blocked: it stays on screen until the page is left
      }
      return next;
    });
  const { busy, error, run, cancel } = useDeskRun();
  const [topic, setTopic] = useState("");
  const running = Boolean(busy);
  // each job filed is noted, so leaving the page mid-wait keeps it; an answer or a failure clears it, Stop too
  const filed = (slot: NonNullable<Kept["pending"]>["slot"], what: string, mode?: Mode) => (job: string) => keep({ pending: { job, slot, what, at: Date.now(), mode } });
  const settle = <T,>(r: T | null | undefined, patch: (v: T, cur: Kept) => Kept) =>
    r !== undefined && keep((cur) => (r === null ? { pending: undefined } : { ...patch(r, cur), pending: undefined }));
  const withCheck = (check: ClaimCheck, cur: Kept): Kept => (cur.rescript ? { rescript: { ...cur.rescript, check } } : {});

  const breakdown = () =>
    run("Why it worked", (o) => runDesk<Breakdown>({ action: "breakdown", url }, { userId, ...o, onFiled: filed("breakdown", "Why it worked") })).then((b) => settle(b, (v) => ({ breakdown: v })));
  const remix = (mode: Mode) => {
    const what = mode === "same-idea" ? "Keep the idea" : "Keep the structure";
    return run(what, async (o) => {
      const b = kept.breakdown ?? (await runDesk<Breakdown>({ action: "breakdown", url }, { userId, ...o, onFiled: filed("breakdown", what) }));
      keep({ breakdown: b });
      return runDesk<Script>({ action: "write", entry: mode, url, breakdown: b, ...(mode === "same-structure" && topic.trim() ? { topic } : {}) }, { userId, ...o, onFiled: filed("version", what, mode) });
    }).then((s) => settle(s, (v) => ({ version: { ...v, mode } })));
  };
  const checkClaims = (job: string) =>
    run("Claim check", (o) => runDesk<ClaimCheck>({ action: "claims", job }, { userId, ...o, onFiled: filed("claims", "Claim check") })).then((c) => settle(c, withCheck));
  const rescript = () =>
    run("Re-script", (o) =>
      runRescript(url, {
        userId, ...o,
        onRescript: (r, job) => keep({ rescript: { ...r, job, check: null } }),
        onFiled: (job, step) => filed(step, step === "claims" ? "Claim check" : "Re-script")(job),
      }),
    ).then((r) => settle(r, (v) => ({ rescript: { ...v.rescript, job: v.job, check: v.check } })));

  // a wait left behind on another page: pick it up (the server fails it after 45 s unclaimed or 4 minutes unanswered)
  useEffect(() => {
    const p = kept.pending;
    if (!p) return;
    if (Date.now() - p.at > 6 * 60_000) return void keep({ pending: undefined });
    if (p.slot === "breakdown") void run(p.what, (o) => pollDesk<Breakdown>(p.job, o), p.at).then((b) => settle(b, (v) => ({ breakdown: v })));
    else if (p.slot === "version") void run(p.what, (o) => pollDesk<Script>(p.job, o), p.at).then((s) => settle(s, (v) => ({ version: { ...v, mode: p.mode ?? "same-idea" } })));
    else if (p.slot === "claims") void run(p.what, (o) => pollDesk<ClaimCheck>(p.job, o), p.at).then((c) => settle(c, withCheck));
    else {
      void run(p.what, (o) => pollDesk<Rescript>(p.job, o), p.at).then((r) => {
        settle(r, (v) => ({ rescript: { ...v, job: p.job, check: null } }));
        if (r) void checkClaims(p.job);
      });
    }
    // once, on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section aria-labelledby="desk-title" className="space-y-4 rounded-xl border border-border/60 p-4 shadow-card">
      <h2 id="desk-title" className="font-serif text-lg font-semibold">Script desk</h2>
      {busy && <DeskWait busy={busy} onStop={() => (cancel(), keep({ pending: undefined }))} />}
      <DeskError text={error} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Hook, beats and angles</h3>
          <Button type="button" variant="outline" size="sm" className={TOUCH} disabled={running} onClick={() => void breakdown()}>{kept.breakdown ? "Break it down again" : "Break it down"}</Button>
        </div>
        {kept.breakdown && <BreakdownView b={kept.breakdown} />}
      </div>

      <div className="space-y-2 border-t border-border/60 pt-4">
        <h3 className="text-sm font-semibold">Remix it</h3>
        <Button type="button" variant="outline" size="sm" className={TOUCH} disabled={running} onClick={() => void remix("same-idea")}>Keep the idea</Button>
        <div className="space-y-1.5">
          <Label htmlFor={`desk-topic-${postId}`}>New topic <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id={`desk-topic-${postId}`} value={topic} maxLength={300} placeholder="Empty picks one from your niche" onChange={(e) => setTopic(e.target.value)} />
            <Button type="button" variant="outline" size="sm" className={`shrink-0 ${TOUCH}`} disabled={running} onClick={() => void remix("same-structure")}>Keep the structure</Button>
          </div>
        </div>
        {kept.version && <ScriptResult userId={userId} s={kept.version} />}
      </div>

      <div className="space-y-2 border-t border-border/60 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Re-script</h3>
          <Button type="button" variant="outline" size="sm" className={TOUCH} disabled={running || !hasWords} onClick={() => void rescript()}>Re-script into me</Button>
        </div>
        {!hasWords && <p className="text-xs text-muted-foreground">This reel has no spoken words to re-script.</p>}
        {kept.rescript && <RescriptView userId={userId} r={kept.rescript} running={running} onCheck={kept.rescript.job ? () => void checkClaims(kept.rescript!.job!) : undefined} />}
      </div>
    </section>
  );
}

function BreakdownView({ b }: { b: Breakdown }) {
  return (
    <div className="space-y-3 text-sm">
      <p>
        <span className="font-medium">"{b.hook.line}"</span>
        {b.hook.type && <span className="ml-2 rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">{b.hook.type}</span>}
      </p>
      {b.hook.why && <p className="text-muted-foreground">{b.hook.why}</p>}
      {b.idea && <p><span className="font-medium">Idea:</span> {b.idea}</p>}
      {b.format.name && (
        <div>
          <p className="font-medium">{b.format.name}</p>
          <ol className="list-decimal space-y-0.5 pl-5 text-muted-foreground">{b.format.beats.map((x) => <li key={x}>{x}</li>)}</ol>
        </div>
      )}
      {b.visual && <p><span className="font-medium">Looks like:</span> {b.visual}</p>}
      {b.why.length > 0 && (
        <div>
          <p className="font-medium">Why it beat their usual</p>
          <ul className="list-disc space-y-0.5 pl-5">{b.why.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}
      {b.remix.length > 0 && (
        <div>
          <p className="font-medium">Angles for your audience</p>
          <ul className="list-disc space-y-0.5 pl-5">{b.remix.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

/** A script with Copy and Save to My posts, and what came with it. */
function ScriptResult({ userId, s }: { userId: string; s: Script }) {
  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-3">
      {s.title && <p className="text-sm font-semibold">{s.title}</p>}
      <p className="whitespace-pre-wrap text-sm">{s.script}</p>
      {/* a new script is a new draft: saving it never overwrites the last one's */}
      <ScriptActions key={s.script} userId={userId} title={s.title} script={s.script} />
      <ScriptExtras s={s} />
    </div>
  );
}

function ScriptActions({ userId, title, script }: { userId: string; title: string; script: string }) {
  const [done, setDone] = useState<"" | "copied" | "saved">("");
  // saving again updates the same draft
  const [draftId, setDraftId] = useState<string | undefined>();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setDone("copied");
    } catch {
      setDone("");
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" className={`gap-1 ${TOUCH}`} onClick={() => void copy()}><CopyIcon className="h-3.5 w-3.5" /> Copy</Button>
      <Button type="button" variant="outline" size="sm" className={TOUCH} onClick={() => (setDraftId(saveScriptDraft(userId, { title, script }, draftId).id), setDone("saved"))}>Save to All posts</Button>
      {done && <span role="status" className="flex items-center gap-1 text-xs text-success"><CheckIcon className="h-3.5 w-3.5" />{done === "copied" ? "Copied" : "Saved"}</span>}
    </div>
  );
}

function RescriptView({ userId, r, running, onCheck }: { userId: string; r: NonNullable<Kept["rescript"]>; running: boolean; onCheck?: () => void }) {
  const script = r.check?.script ?? r.script;
  const unsupported = r.check?.unsupported ?? [];
  const fill = [...new Set([...r.fill, ...(script.match(/\[[^\]]+\]/g) ?? [])])];
  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-3 text-sm">
      <p className="whitespace-pre-wrap">{script}</p>
      <ScriptActions key={script} userId={userId} title="" script={script} />
      {!r.check && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-amber-700 dark:text-amber-400">Claims not checked yet: it may say things your pages don't back.</p>
          {onCheck && <Button type="button" variant="outline" size="sm" className={TOUCH} disabled={running} onClick={onCheck}>Check claims</Button>}
        </div>
      )}
      {r.check && r.changes.length === 0 && unsupported.length === 0 && <p className="text-muted-foreground">Nothing in it belongs to its creator, so it stays word for word.</p>}
      {r.changes.length > 0 && (
        <div>
          <p className="font-medium">What changed</p>
          <ul className="space-y-1">{r.changes.map((c) => <li key={c.from + c.to}><span className="line-through text-muted-foreground">{c.from}</span> to {c.to} <span className="text-muted-foreground">({c.why})</span></li>)}</ul>
        </div>
      )}
      {unsupported.length > 0 && (
        <div>
          <p className="font-medium">Claims your pages don't back, now placeholders</p>
          <ul className="list-disc space-y-0.5 pl-5">{unsupported.map((u) => <li key={u.sentence}>{u.claim}</li>)}</ul>
        </div>
      )}
      {fill.length > 0 && (
        <div>
          <p className="font-medium">Fill these in</p>
          <ul className="flex flex-wrap gap-1.5">{fill.map((f) => <li key={f} className="rounded-full border border-border/70 px-2 py-0.5 text-xs">{f}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
