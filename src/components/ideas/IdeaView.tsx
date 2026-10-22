// /ideas' open idea (Leo only): title, angle, why it fits, where it came from, its chips and hooks, and the four
// actions with their keys, then Refine. More like this and Refine ask idea-dump mode "ideas" (cap ideas-daily), so
// both carry the PriceChip; the page runs every action.

import type { FormEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import CopyLinkButton from "@/components/CopyLinkButton";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getFunnelStage } from "@/data/funnelFramework";
import { CAPPED_LINE, formatWord, safeLink, STEER_MAX, type IdeaStatus, type InboxIdea } from "@/lib/ideasInbox";
import type { Label } from "@/lib/labels";
import { links } from "@/lib/links";
import { chipOf, fitText } from "@/components/ideas/IdeaList";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";

function Key({ k }: { k: string }) {
  // the key badge, only where there is a keyboard
  return <kbd className="ml-1.5 hidden rounded border border-current/30 px-1 font-sans text-[10px] font-medium opacity-70 lg:inline [@media(pointer:coarse)]:hidden">{k}</kbd>;
}

function Head({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold tracking-wide text-muted-foreground">{children}</p>;
}

export default function IdeaView(p: {
  idea: InboxIdea;
  status: IdeaStatus | null;
  labels: Label[];
  /** Uses of ideas-daily left today, null while unread. */
  left: number | null;
  /** Another call is writing ideas. */
  busy: boolean;
  /** This idea's own More like this or Refine is running. */
  writing: "more" | "refine" | null;
  capped: boolean;
  /** This idea's More like this or Refine failed: the line, and whether Try again can help. */
  failed: { line: string; retry: boolean } | null;
  refine: string;
  onRefineText: (text: string) => void;
  onWrite: () => void;
  onShortlist: () => void;
  onDiscard: () => void;
  onMore: (steer?: string) => void;
  onRetry: () => void;
  onLabel: (id: string) => void;
  onBack: () => void;
}) {
  const { idea } = p;
  const label = p.labels.find((l) => l.id === idea.labelId);
  const stage = idea.stage ? getFunnelStage(idea.stage) : null;
  const source = safeLink(idea.fromUrl);
  const off = p.busy || p.capped;
  const refine = (e: FormEvent) => {
    e.preventDefault();
    if (p.refine.trim()) p.onMore(p.refine);
  };

  return (
    <article className="space-y-5 rounded-xl border border-border/60 p-4 shadow-card sm:p-6" aria-label="Open idea">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className={`-ml-2 lg:hidden ${TOUCH}`} onClick={p.onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> All ideas
        </Button>
        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground">{chipOf(idea)}</span>
        {fitText(idea.fit) && <span className="text-[11px] tabular-nums text-muted-foreground">{fitText(idea.fit)}</span>}
        <CopyLinkButton path={links.ideas({ idea: idea.key })} className="ml-auto" />
      </div>

      <div className="space-y-2">
        <h2 className="font-serif text-xl font-semibold leading-snug tracking-tight sm:text-2xl">{idea.title}</h2>
        {idea.angle && <p className="whitespace-pre-line text-sm text-foreground/90">{idea.angle}</p>}
      </div>

      {idea.why && (
        <div className="space-y-1">
          <Head>WHY IT FITS YOU</Head>
          <p className="text-sm">{idea.why}</p>
        </div>
      )}

      <div className="space-y-1">
        <Head>FROM</Head>
        <p className="text-sm">
          {!source ? idea.from
            : source.external ? <a href={source.href} target="_blank" rel="noreferrer" className="underline underline-offset-2">{idea.from}</a>
            : <Link to={source.href} className="underline underline-offset-2">{idea.from}</Link>}
        </p>
      </div>

      {(idea.format || stage || label) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {idea.format && <span className="rounded-full border border-border/60 px-2.5 py-1">{formatWord(idea.format)}</span>}
          {stage && <span className="rounded-full border border-border/60 px-2.5 py-1">{stage.letter} {stage.label}</span>}
          {label && (
            <button type="button" onClick={() => p.onLabel(label.id)} className={`rounded-full border border-border/60 px-2.5 py-1 hover:border-primary/40 ${TOUCH}`} title="Show ideas with this label">
              {label.name}
            </button>
          )}
        </div>
      )}

      {idea.hooks && idea.hooks.length > 0 && (
        <div className="space-y-1">
          <Head>HOOKS</Head>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {idea.hooks.slice(0, 3).map((h) => <li key={h}>{h}</li>)}
          </ul>
        </div>
      )}

      <div className="space-y-3 border-t border-border/60 pt-4">
        <div className="flex flex-wrap gap-2">
          <Button className={TOUCH} onClick={p.onWrite}>Write this post<Key k="W" /></Button>
          <Button variant="outline" className={TOUCH} onClick={p.onShortlist} aria-pressed={p.status === "shortlisted"}>
            {p.status === "shortlisted" ? "Shortlisted" : "Shortlist"}<Key k="S" />
          </Button>
          <Button variant="outline" className={TOUCH} onClick={p.onDiscard}>
            {p.status === "discarded" ? "Put back" : "Discard"}<Key k="D" />
          </Button>
          <Button variant="outline" className={TOUCH} onClick={() => p.onMore()} disabled={off} title={p.capped ? CAPPED_LINE : undefined}>
            {p.writing === "more" ? "Writing..." : "More like this"}<Key k="M" />
          </Button>
        </div>
        <form onSubmit={refine} className="flex flex-wrap items-center gap-2">
          <Input
            value={p.refine}
            onChange={(e) => p.onRefineText(e.target.value)}
            placeholder="Make it about..."
            maxLength={STEER_MAX}
            aria-label="Refine: make it about"
            className="min-w-[12rem] flex-1"
          />
          <Button type="submit" variant="secondary" className={`shrink-0 ${TOUCH}`} disabled={off || !p.refine.trim()} title={p.capped ? CAPPED_LINE : undefined}>
            {p.writing === "refine" ? "Writing..." : "Refine"}
          </Button>
        </form>
        <p><PriceChip feature="ideas-daily" left={p.left} /></p>
        {p.failed && (
          <div className="flex flex-wrap items-center gap-2 text-sm" role="alert">
            <span className="text-destructive">{p.failed.line}</span>
            {p.failed.retry && <Button size="sm" variant="outline" className={TOUCH} onClick={p.onRetry} disabled={off}>Try again</Button>}
          </div>
        )}
      </div>
    </article>
  );
}
