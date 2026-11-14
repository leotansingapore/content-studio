// A ready answer in the agent's thread (agentAnswers.ts), in the MADE block's frame: a tag, then what was asked for.
// Trending: up to 5 niche posts, then Formats taking off (up to 3 templates), each with its picture, why it is trending,
// Remix (a new chat with the post attached, or the format's page) and Hide (gone for this brand here and in Studio). Best post: its numbers, when it went out and Make another like it. Angles: the
// wizard's price and uses left before Suggest spends, then the angles and Plan a campaign with these. Each empty
// state names the one page that fixes it.

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { EyeSlashIcon, RepeatIcon, TrendUpIcon } from "@phosphor-icons/react";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { seedWizard, suggestAngles, anotherLikeIt, type Answer, type TrendRow } from "@/lib/agentAnswers";
import { useUsesLeft } from "@/lib/aiUsage";
import { SUGGEST_COUNT, jobKey, onSuggest, suggestJob, suggestVersion } from "@/lib/angleSuggest";
import { brandFacts } from "@/lib/competitors";
import { links } from "@/lib/links";
import { hideItem, loadNiche, onNicheChanged, unhideItem } from "@/lib/nicheFeed";
import { reasonText } from "@/lib/prices";
import { dayMonth } from "@/lib/remixSource";
import { platformName } from "@/lib/socialConnect";

const BOX = "w-full max-w-xl rounded-xl border border-border bg-card shadow-card";
const HEAD = "flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2";
const TAG = "text-[11px] font-semibold tracking-[0.14em]";
const LINK = "inline-flex min-h-9 items-center font-medium text-primary hover:underline [@media(pointer:coarse)]:min-h-11";

function Thumb({ cover }: { cover?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="relative h-[85px] w-[48px] shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted" aria-hidden>
      {cover && !broken ? (
        <img src={cover} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-muted-foreground">
          <TrendUpIcon className="h-4 w-4" />
        </span>
      )}
    </span>
  );
}

function TrendList({ rows, onHide }: { rows: TrendRow[]; onHide(r: TrendRow): void }) {
  return (
    <ol className="divide-y divide-border/60">
      {rows.map((r) => (
        <li key={r.id ?? r.remix} className="flex items-center gap-3 p-3">
          <Thumb cover={r.cover} />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 break-words text-sm font-medium">{r.title}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.who}</p>
            <p className="line-clamp-2 text-xs tabular-nums text-muted-foreground">{r.why}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <Button asChild size="sm" variant="outline" className="h-11 sm:h-9">
              <Link to={r.remix} aria-label={`Remix: ${r.title}`}>
                <RepeatIcon className="h-4 w-4" aria-hidden /> Remix
              </Link>
            </Button>
            {r.id && (
              <Button type="button" size="sm" variant="ghost" className="h-11 gap-1.5 text-muted-foreground sm:h-9" aria-label={`Hide: ${r.title}`} onClick={() => onHide(r)}>
                <EyeSlashIcon className="h-4 w-4" aria-hidden /> Hide
              </Button>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Trending({ userId, rows, formats = [], niche }: { userId: string; rows: TrendRow[]; formats?: TrendRow[]; niche: boolean }) {
  const { toast } = useToast();
  const [hidden, setHidden] = useState(() => new Set(loadNiche(userId).hidden));
  useEffect(() => onNicheChanged(() => setHidden(new Set(loadNiche(userId).hidden))), [userId]);
  const shown = (list: TrendRow[]) => list.filter((r) => !r.id || !hidden.has(r.id));
  const hide = (r: TrendRow) => {
    hideItem(userId, r.id!);
    toast({
      title: `Hidden for ${brandFacts(userId).name || "this brand"}.`,
      duration: 6000,
      action: <ToastAction altText="Undo" onClick={() => unhideItem(userId, r.id!)}>Undo</ToastAction>,
    });
  };
  const posts = shown(rows);
  const templates = shown(formats);
  const heading = useId();
  return (
    <section aria-label="Trending in your niche" className={BOX}>
      <header className={HEAD}>
        <span className={`${TAG} text-primary`}>TRENDING</span>
        <Link to={links.swipe({ tab: "foryou" })} className="inline-flex min-h-9 items-center text-xs text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:min-h-11">
          See all
        </Link>
      </header>
      {posts.length > 0 && <TrendList rows={posts} onHide={hide} />}
      {!niche && (
        <p className={`px-4 py-3 text-sm text-muted-foreground ${posts.length ? "border-t border-border/60" : ""}`}>
          Nothing from your niche is taking off yet. Watch a competitor or follow an account and their best posts show here.{" "}
          <Link to={links.swipe({ tab: "foryou" })} className={LINK}>
            Open For you
          </Link>
        </p>
      )}
      {templates.length > 0 && (
        <section aria-labelledby={heading} className="border-t border-border/60">
          <h3 id={heading} className="px-4 pt-3 text-xs font-semibold text-muted-foreground">
            Formats taking off
          </h3>
          <TrendList rows={templates} onHide={hide} />
        </section>
      )}
    </section>
  );
}

function Best({ answer }: { answer: Extract<Answer, { kind: "best" }> }) {
  const p = answer.post;
  return (
    <section aria-label="Your best post" className={BOX}>
      <header className={HEAD}>
        <span className={`${TAG} text-success`}>BEST POST</span>
        {p && <span className="text-[11px] text-muted-foreground">{`${dayMonth(p.at)}, ${platformName(p.platform)}`}</span>}
      </header>
      {p ? (
        <div className="space-y-2 p-4">
          <p className="line-clamp-3 break-words text-sm font-medium">{p.title}</p>
          <p className="text-xs tabular-nums text-muted-foreground">{p.numbers}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild size="sm" className="h-11 sm:h-9">
              <Link to={anotherLikeIt(p.id)}>Make another like it</Link>
            </Button>
            <Button asChild size="sm" variant="ghost" className="h-11 sm:h-9">
              <Link to={links.generate({ draft: p.id })}>Open the post</Link>
            </Button>
          </div>
        </div>
      ) : (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          {answer.posted ? "None of your posted posts has numbers yet. Connect your accounts or type them in." : "Nothing is marked posted yet. Mark the posts that went out, then add their numbers."}{" "}
          {answer.posted ? (
            <Link to={links.analytics({ section: "add-your-numbers" })} className={LINK}>
              Add your numbers
            </Link>
          ) : (
            <Link to={links.drafts()} className={LINK}>
              Open All posts
            </Link>
          )}
        </p>
      )}
    </section>
  );
}

function Angles({ userId, threadId, msgId, answer }: { userId: string; threadId: string; msgId: string; answer: Extract<Answer, { kind: "angles" }> }) {
  useSyncExternalStore(onSuggest, suggestVersion);
  const job = suggestJob();
  const aud = answer.audience;
  const suggesting = !!aud && job.state === "suggesting" && job.key === jobKey(userId, aud.id);
  const left = useUsesLeft(job.state === "suggesting")("campaign-angles");
  return (
    <section aria-label="New angles" className={BOX}>
      <header className={HEAD}>
        <span className={`${TAG} text-primary`}>ANGLES</span>
        {aud && <span className="min-w-0 truncate text-[11px] text-muted-foreground">For {aud.name}</span>}
      </header>
      {!aud ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          Angles are written for someone. Add who you talk to first.{" "}
          <Link to={links.audiences()} className={LINK}>
            Add an audience
          </Link>
        </p>
      ) : answer.angles?.length ? (
        <div className="space-y-3 p-4">
          <ol className="space-y-2">
            {answer.angles.map((a, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{a.title}</span>
                {a.line && <span className="block break-words text-muted-foreground">{a.line}</span>}
              </li>
            ))}
          </ol>
          <Button asChild size="sm" className="h-11 sm:h-9">
            <Link to={links.campaignNew({ audience: aud.id, step: "angles" })} onClick={() => seedWizard(userId, aud.id, answer.angles!)}>
              Plan a campaign with these
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2 p-4">
          <p className="text-sm text-muted-foreground">
            {suggesting ? `Writing ${SUGGEST_COUNT} angles for ${aud.name}. This takes a few seconds.` : `${SUGGEST_COUNT} angles from your positioning and what ${aud.name} care about.`}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button type="button" size="sm" className="h-11 sm:h-9" disabled={job.state === "suggesting" || left === 0} onClick={() => void suggestAngles(userId, threadId, msgId)}>
              {suggesting ? "Suggesting..." : `Suggest ${SUGGEST_COUNT} angles`}
            </Button>
            <PriceChip feature="campaign-angles" left={left} />
          </div>
          {reasonText({ left, leo: true }) && <p className="text-xs text-destructive">{reasonText({ left, leo: true })}</p>}
          {answer.error && !suggesting && (
            <p className="text-xs text-destructive" role="alert">
              {answer.error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default function AnswerCard({ userId, threadId, msgId, answer }: { userId: string; threadId: string; msgId: string; answer: Answer }) {
  if (answer.kind === "trending") return <Trending userId={userId} rows={answer.rows} formats={answer.formats} niche={answer.niche} />;
  if (answer.kind === "best") return <Best answer={answer} />;
  return <Angles userId={userId} threadId={threadId} msgId={msgId} answer={answer} />;
}
