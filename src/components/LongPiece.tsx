// One long piece into a week of posts: paste a talk transcript, newsletter or
// webinar notes, see its claims, numbers, stories and quotable lines with
// counts, and get 5 standalone posts, each opening with a different hook
// formula. Keep the ones you want as drafts. Logic: src/lib/repurpose.ts and
// supabase/functions/idea-dump (mode "long", cap "repurpose-long").

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ThinkingOrb } from "thinking-orbs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { loadDrafts, upsertDraft, type DraftEntry } from "@/lib/draftHistory";
import { HOOK_FORMULAS, hookFormula } from "@/lib/hookFormulas";
import { buildIdeaDumpContext, preferredAudience } from "@/lib/ideaDump";
import {
  MAX_LONG_CHARS,
  loadLongRun,
  longPieceFormulas,
  longPostEntry,
  saveLongRun,
  weekFromLongPiece,
  type LongExtracts,
  type LongRun,
} from "@/lib/repurpose";
import { AlertTriangle, Check, Clock, FileText, PenLine, RotateCcw, Save, Sparkles } from "lucide-react";

const GROUPS: { key: keyof LongExtracts; one: string; many: string }[] = [
  { key: "claims", one: "claim", many: "claims" },
  { key: "numbers", one: "number", many: "numbers" },
  { key: "stories", one: "story", many: "stories" },
  { key: "lines", one: "quotable line", many: "quotable lines" },
];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function LongPiece() {
  const [userId, setUserId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [run, setRun] = useState<LongRun | null>(null);
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ kind: "limit" | "error"; message: string } | null>(null);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const id = data.session?.user.id ?? null;
      setUserId(id);
      setRun(loadLongRun(id));
      setDrafts(loadDrafts(id));
    });
    return () => {
      active = false;
    };
  }, []);

  const kept = (draftId?: string) => Boolean(draftId) && drafts.some((d) => d.id === draftId);
  const unkept = run ? run.posts.filter((p) => !kept(p.draftId)) : [];

  const make = async () => {
    if (!userId || loading || !text.trim()) return;
    if (unkept.length && !window.confirm(`Replace the ${plural(unkept.length, "post", "posts")} you haven't kept?`)) return;
    setNotice(null);
    setLoading(true);
    const formulas = longPieceFormulas(Math.floor(Math.random() * HOOK_FORMULAS.length));
    const outcome = await weekFromLongPiece(text, buildIdeaDumpContext(userId), formulas);
    setLoading(false);
    if (outcome.kind !== "ok") {
      setNotice(outcome);
      return;
    }
    // saved before anything else, so leaving the page mid-run keeps the posts
    setRun(saveLongRun(userId, { createdAt: new Date().toISOString(), truncated: outcome.truncated, extracts: outcome.extracts, posts: outcome.posts }));
    setUsage(outcome.usage);
  };

  const keep = (indexes: number[]) => {
    if (!userId || !run) return;
    const context = buildIdeaDumpContext(userId);
    const platform = context.platforms[0] ?? "linkedin";
    const audience = preferredAudience(userId) ?? "general";
    const posts = [...run.posts];
    // newest first in My posts: keep the last one first so post 1 ends on top
    for (const i of [...indexes].reverse()) {
      const entry = longPostEntry(posts[i], platform, audience);
      upsertDraft(userId, entry);
      posts[i] = { ...posts[i], draftId: entry.id };
    }
    setRun(saveLongRun(userId, { ...run, posts }));
    setDrafts(loadDrafts(userId));
  };

  const found = run ? GROUPS.reduce((n, g) => n + run.extracts[g.key].length, 0) : 0;

  return (
    <section id="long-piece" className="scroll-mt-20 space-y-4" aria-labelledby="long-piece-title">
      <div className="flex items-center gap-1">
        <h2 id="long-piece-title" className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
          <FileText className="h-4 w-4 text-primary" /> One long piece, five posts
        </h2>
        <InfoTip label="About one long piece">
          Each post stands on its own and opens with a different hook formula.
        </InfoTip>
      </div>

      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <Label htmlFor="long-piece-text">Paste a talk transcript, newsletter or webinar notes</Label>
          <Textarea
            id="long-piece-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            readOnly={loading}
            rows={8}
            maxLength={MAX_LONG_CHARS}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => void make()}
              disabled={loading || !text.trim() || !userId}
              className="h-11 gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95 sm:h-10"
            >
              <Sparkles className="h-4 w-4" /> Make 5 posts
            </Button>
            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
              {text.length.toLocaleString()}/{MAX_LONG_CHARS.toLocaleString()}
            </span>
          </div>
        </CardContent>
      </Card>

      <div aria-live="polite" className="space-y-3 empty:hidden">
        {loading && (
          <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4" role="status">
            <ThinkingOrb state="composing" size={20} theme="light" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Reading it and writing 5 posts…</p>
              <p className="text-xs text-muted-foreground">This can take up to a minute.</p>
            </div>
          </div>
        )}
        {!loading && notice?.kind === "error" && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert">
            <p className="flex min-w-0 flex-1 items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {notice.message}
            </p>
            <Button size="sm" variant="outline" onClick={() => void make()} className="h-11 gap-1.5 sm:h-9">
              <RotateCcw className="h-4 w-4" /> Try again
            </Button>
          </div>
        )}
        {!loading && notice?.kind === "limit" && (
          <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-foreground" role="status">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="space-y-0.5">
              <p className="font-medium">Daily limit reached</p>
              <p className="text-muted-foreground">{notice.message} Your piece stays in the box.</p>
            </div>
          </div>
        )}
      </div>

      {run && (
        <div className="space-y-3" data-testid="long-piece-run">
          <Card className="border-border/60 shadow-card">
            <CardContent className="space-y-2 p-4 sm:p-5">
              <details className="group">
                <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-1.5 [&::-webkit-details-marker]:hidden">
                  <span className="mr-1 text-sm font-semibold text-foreground">Found in it</span>
                  {GROUPS.map((g) => (
                    <span key={g.key} className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {plural(run.extracts[g.key].length, g.one, g.many)}
                    </span>
                  ))}
                  <span className="text-xs font-medium text-primary group-open:hidden">Show</span>
                </summary>
                <div className="mt-3 space-y-3">
                  {GROUPS.filter((g) => run.extracts[g.key].length).map((g) => (
                    <div key={g.key} className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.many}</p>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
                        {run.extracts[g.key].map((x, i) => (
                          <li key={i} className="[overflow-wrap:anywhere]">{x}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
              {found < 4 && (
                <p className="flex items-start gap-1.5 text-xs text-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" /> Only {plural(found, "thing", "things")} found,
                  so the posts may be thin.
                </p>
              )}
              {run.truncated && (
                <p className="text-xs text-muted-foreground">
                  Only the first {MAX_LONG_CHARS.toLocaleString()} characters were read.
                </p>
              )}
              {usage && (
                <p className="text-[11px] text-muted-foreground">
                  {usage.used} of {usage.limit} runs used today.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Your week: {plural(run.posts.length, "post", "posts")}</p>
            {unkept.length > 1 && (
              <Button
                variant="outline"
                onClick={() => keep(run.posts.flatMap((p, i) => (kept(p.draftId) ? [] : [i])))}
                className="h-11 gap-1.5 sm:h-10"
              >
                <Save className="h-4 w-4" /> Keep all {unkept.length} as drafts
              </Button>
            )}
          </div>

          {run.posts.map((p, i) => {
            const formula = hookFormula(p.formulaId);
            const isKept = kept(p.draftId);
            return (
              <Card key={i} className="border-border/60 shadow-card" data-testid="long-piece-post">
                <CardContent className="space-y-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      Post {i + 1}
                    </span>
                    {formula && (
                      <span className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary">
                        {formula.name}
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">{p.post}</p>
                  {p.basedOn && (
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">Built on: {p.basedOn}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                    {isKept ? (
                      <>
                        <span className="inline-flex h-11 items-center gap-1.5 rounded-md border border-success/30 bg-success/5 px-3 text-sm font-medium text-success sm:h-9">
                          <Check className="h-4 w-4" /> Kept
                        </span>
                        <Button asChild size="sm" className="h-11 gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95 sm:h-9">
                          <Link to={`/generate?draft=${encodeURIComponent(p.draftId!)}`}>
                            <PenLine className="h-4 w-4" /> Open in Write
                          </Link>
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => keep([i])} className="h-11 gap-1.5 sm:h-9">
                        <Save className="h-4 w-4" /> Keep as draft
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
