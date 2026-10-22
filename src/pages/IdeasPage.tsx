// Ideas (/ideas, Leo's sign-ins only; docs/north-star/items/plan-ideas-inbox.md): every idea the brand already has,
// from Idea Dump, its account audit, Your market, For you, trends, news and saved posts, in one list beside a set
// written for it each day. The set starts on Get today's ideas, or on the visit once the morning switch at the
// foot is on (Q6, off by default); the call runs outside React (src/lib/ideasInbox.ts), so leaving keeps it.
// tab, source and label filter the list (replace); idea opens one (push: Back returns to the list on a phone).
// J and K move, S D W M act on the open idea, Z undoes. The audit ideas are read from their table, never through
// openAudit, so opening this page never starts a paid refresh. Everyone else gets the 404 page.

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, X } from "lucide-react";
import IdeaList from "@/components/ideas/IdeaList";
import IdeaView from "@/components/ideas/IdeaView";
import PriceChip from "@/components/PriceChip";
import SectionTabs, { PIPELINE_TABS } from "@/components/SectionTabs";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { InfoTip } from "@/components/ui/info-tip";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import { loadBrand } from "@/lib/carousel";
import { buildIdeaDumpContext } from "@/lib/ideaDump";
import {
  arrange, CAPPED_LINE, clearFail, genIdeas, getIdeas, hasTodaysSet, ideasFail, ideasRun, inTab, keyAction, loadAuditIdeas, loadIdeas, loadPoolStores,
  markWritten, NO_POSITIONING_LINE, onIdeasChanged, onIdeasJob, poolIdeas, restoreStatus, setMorning, setStatus, SOURCE_NAME, SOURCES, startMorning,
  TABS, undoLast, UNSCORED_LINE, type AuditIdeas, type IdeaSource, type IdeasTab, type InboxIdea, type StatusChange,
} from "@/lib/ideasInbox";
import { loadLabels } from "@/lib/labels";
import { links } from "@/lib/links";
import { priceOf, priceText, type Price } from "@/lib/prices";
import { activeProfile, scoped } from "@/lib/profiles";
import { sgDay } from "@/lib/goals";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useGoneItem, useUrlItem, useUrlState, useUrlUpdate } from "@/lib/urlState";
import { cn } from "@/lib/utils";
import NotFoundPage from "@/pages/NotFoundPage";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const TAB_NAME: Record<IdeasTab, string> = { inbox: "Inbox", shortlist: "Shortlist", discarded: "Discarded" };
const IDEAS_PRICE = priceText(priceOf("ideas-daily") as Price);
const refineKey = (userId: string) => `cs-ideas-refine-${scoped(userId)}`;

export default function IdeasPage() {
  const leo = useLeoUser();
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage />;
  return <Ideas userId={leo.id} />;
}

function Ideas({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const offJob = onIdeasJob(redraw);
    const offStore = onIdeasChanged(redraw);
    return () => {
      offJob();
      offStore();
    };
  }, []);

  // the brand's own audit ideas load from their table; null while they do
  const [audits, setAudits] = useState<AuditIdeas[] | null>(null);
  const [auditsFailed, setAuditsFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadAuditIdeas(userId).then(
      (a) => live && setAudits(a),
      () => {
        if (!live) return;
        setAudits([]);
        setAuditsFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [userId]);
  // the visit writes today's set only once Leo has turned the morning switch on (Q6)
  useEffect(() => startMorning(userId), [userId]);

  const [tab, setTab] = useUrlState<IdeasTab>("tab", "inbox", { allowed: TABS });
  const [source, setSource] = useUrlState<IdeaSource | "all">("source", "all", { allowed: ["all", ...SOURCES] });
  const [label, setLabel] = useUrlState<string>("label", "");
  const [ideaKey, openIdea, closeIdea] = useUrlItem("idea");
  const update = useUrlUpdate();

  const now = new Date();
  const state = loadIdeas(userId);
  const labels = loadLabels(userId);
  const pooled = useMemo(() => poolIdeas(loadPoolStores(userId, audits ?? []), new Date()), [userId, audits]);
  const all = [...genIdeas(state), ...pooled];
  const list = arrange(all, state.status, { tab, source, label });
  const linked = ideaKey ? all.find((i) => i.key === ideaKey) ?? null : null;
  // an audit idea's link waits for the audits; anything else that is gone falls back to the list
  useGoneItem("idea", ideaKey?.startsWith("audit:") && audits === null ? undefined : !!linked, "idea");
  const open = linked ?? list[0] ?? null;
  const index = open ? list.findIndex((i) => i.key === open.key) : -1;

  const running = ideasRun(userId);
  const failed = ideasFail(userId);
  const left = useUsesLeft(Boolean(running))("ideas-daily");
  const capped = left === 0 || failed?.line === CAPPED_LINE;
  const positioned = useMemo(() => !!buildIdeaDumpContext(userId).positioning, [userId]);
  const todaySet = hasTodaysSet(state, now);
  const today = state.days.find((d) => d.day === sgDay(now))?.ideas.filter((g) => !g.like) ?? [];
  const unscored = today.length > 0 && today.every((g) => g.fit === null);
  const brand = loadBrand(userId)?.name?.trim() || activeProfile(userId)?.name || "your brand";
  const setFailed = failed && !failed.like ? failed : null;

  const [refine, setRefineText] = useState(() => {
    try {
      return sessionStorage.getItem(refineKey(userId)) ?? "";
    } catch {
      return "";
    }
  });
  const typeRefine = (text: string) => {
    setRefineText(text);
    try {
      sessionStorage.setItem(refineKey(userId), text);
    } catch {
      // blocked: kept for this visit
    }
  };

  // ---- actions --------------------------------------------------------------------------------------------------

  /** The open idea is leaving this tab: open the one after it (or before), as a linked idea does. */
  const leave = (key: string) => {
    if (!ideaKey) return;
    const i = list.findIndex((x) => x.key === key);
    const next = list[i + 1] ?? list[i - 1];
    if (next && next.key !== key) update({ idea: next.key });
    else closeIdea();
  };
  const undoAction = (prev: StatusChange) => <ToastAction altText="Undo" onClick={() => restoreStatus(userId, prev)}>Undo</ToastAction>;
  const shortlist = (i: InboxIdea) => {
    const on = state.status[i.key]?.s !== "shortlisted";
    const prev = setStatus(userId, [i.key], on ? "shortlisted" : null);
    leave(i.key);
    toast({ title: on ? "Shortlisted." : "Taken off the shortlist.", action: undoAction(prev) });
  };
  const discard = (i: InboxIdea) => {
    const back = state.status[i.key]?.s === "discarded";
    const prev = setStatus(userId, [i.key], back ? null : "discarded");
    leave(i.key);
    toast({ title: back ? "Put back in the inbox." : "Idea discarded.", duration: 5000, action: undoAction(prev) });
  };
  const write = (i: InboxIdea) => {
    markWritten(userId, i);
    navigate(i.writeUrl);
  };
  const more = (i: InboxIdea, steer?: string) => void getIdeas(userId, { like: { key: i.key, title: i.title, angle: i.angle }, ...(steer ? { steer } : {}) });
  const undo = () => toast({ title: undoLast(userId) ? "Undone." : "Nothing to undo." });
  const discardAll = () => {
    const keys = list.map((i) => i.key);
    if (!window.confirm(`Discard all ${keys.length} ideas in this list?`)) return;
    const prev = setStatus(userId, keys, "discarded");
    if (ideaKey) closeIdea();
    toast({ title: `Discarded ${keys.length} ideas.`, duration: 5000, action: undoAction(prev) });
  };

  // keys act on the open idea; the newest handler is read on each key
  const onKey = useRef<(e: KeyboardEvent) => void>();
  onKey.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    const inField = !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
    const act = keyAction(e.key, { inField, mod: e.metaKey || e.ctrlKey || e.altKey || e.shiftKey }, index, list.length);
    if (!act || document.querySelector('[role="dialog"]')) return;
    e.preventDefault();
    if (act.act === "move") return list[act.to] && update({ idea: list[act.to].key });
    if (act.act === "undo") return undo();
    if (!open) return;
    if (act.act === "shortlist") shortlist(open);
    else if (act.act === "discard") discard(open);
    else if (act.act === "write") write(open);
    else if (!running && !capped) more(open);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey.current?.(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const tabCount = (t: IdeasTab) => arrange(all, state.status, { tab: t, source, label }).length;
  const sourceCount = (s: IdeaSource | "all") => all.filter((i) => inTab(i.key, state.status, tab) && (s === "all" || i.source === s) && (!label || i.labelId === label)).length;
  const empty =
    tab === "shortlist" ? "Nothing shortlisted yet."
    : tab === "discarded" ? "Nothing discarded."
    : source !== "all" || label ? `No ideas from ${source === "all" ? "this label" : SOURCE_NAME[source]} here.`
    : !todaySet ? "Inbox clear. Press Get today's ideas for a fresh set."
    : state.morning ? "Inbox clear. New ideas come with your next visit tomorrow."
    : "Inbox clear. Press More ideas for a fresh set.";
  const ownRun = running?.like && open && running.like.key === open.key ? (running.steer ? "refine" : "more") : null;
  const ownFail = failed?.like && open && failed.like.key === open.key ? failed : null;
  const activeLabel = labels.find((l) => l.id === label);

  return (
    <div className="space-y-5">
      <SectionTabs tabs={PIPELINE_TABS} />
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex items-center gap-1">
          <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Ideas</h1>
          <InfoTip label="About ideas">Every idea you already have, plus a set written for you each day.</InfoTip>
        </div>
        <div className="ml-auto flex flex-col items-end gap-0.5">
          <Button className={TOUCH} onClick={() => void getIdeas(userId)} disabled={!!running || capped || !positioned} title={capped ? CAPPED_LINE : undefined}>
            {todaySet ? "More ideas" : "Get today's ideas"}
          </Button>
          <PriceChip feature="ideas-daily" left={left} />
        </div>
      </header>

      {running && !running.like && (
        <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm text-primary" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" />
          Writing today's ideas for {brand}...{running.auto ? ` ${IDEAS_PRICE}` : ""}
        </p>
      )}
      {!positioned && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          {NO_POSITIONING_LINE}
          <Link to={links.plan({ view: "setup" })} className="font-medium text-primary underline underline-offset-2">Set up positioning</Link>
        </p>
      )}
      {setFailed && !running && (
        <div className="flex flex-wrap items-center gap-2 text-sm" role="alert">
          <span className={setFailed.retry ? "text-destructive" : "text-muted-foreground"}>{setFailed.line}</span>
          {setFailed.retry && <Button size="sm" variant="outline" className={TOUCH} onClick={() => void getIdeas(userId, { steer: setFailed.steer })} disabled={capped}>Try again</Button>}
          <button type="button" onClick={clearFail} aria-label="Dismiss" className={`text-muted-foreground ${TOUCH}`}><X className="h-4 w-4" /></button>
        </div>
      )}
      {unscored && <p className="text-sm text-muted-foreground">{UNSCORED_LINE}</p>}

      <div className="space-y-3">
        <div className="flex gap-1 border-b border-border/60" role="tablist" aria-label="Ideas by status">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn("-mb-px min-h-11 border-b-2 px-3 text-sm font-medium", tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {TAB_NAME[t]} <span className="tabular-nums text-muted-foreground">{tabCount(t)}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">From:</span>
          {(["all", ...SOURCES] as const).map((s) => (
            <FilterChip key={s} active={source === s} onClick={() => setSource(s)} count={s === "posts" && audits === null ? undefined : sourceCount(s)}>
              {s === "all" ? "All" : SOURCE_NAME[s]}
              {s === "posts" && audits === null && <Loader2 className="h-3 w-3 animate-spin" aria-label="Loading" />}
            </FilterChip>
          ))}
          {label && (
            <FilterChip active onClick={() => setLabel("")}>
              {activeLabel?.name ?? "Label"} <X className="h-3 w-3" aria-label="Clear the label" />
            </FilterChip>
          )}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className={cn("min-w-0", ideaKey && "hidden lg:block")}>
          <IdeaList
            ideas={list}
            openKey={open?.key ?? null}
            onOpen={openIdea}
            writing={!!running && !running.like && (source === "all" || source === "today") && tab === "inbox"}
            tab={tab}
            empty={empty}
            onDiscardAll={discardAll}
            postsFailed={auditsFailed}
          />
        </div>
        <div className={cn("min-w-0 lg:sticky lg:top-4", !ideaKey && "hidden lg:block")}>
          {open && (
            <IdeaView
              idea={open}
              status={state.status[open.key]?.s ?? null}
              labels={labels}
              left={left}
              busy={!!running}
              writing={ownRun}
              capped={capped}
              failed={ownFail}
              refine={refine}
              onRefineText={typeRefine}
              onWrite={() => write(open)}
              onShortlist={() => shortlist(open)}
              onDiscard={() => discard(open)}
              onMore={(steer) => more(open, steer)}
              onRetry={() => ownFail && more(open, ownFail.steer)}
              onLabel={(id) => update({ label: id, idea: null })}
              onBack={closeIdea}
            />
          )}
        </div>
      </div>

      <p className="hidden text-xs text-muted-foreground lg:block [@media(pointer:coarse)]:hidden">J K move &nbsp; S shortlist &nbsp; D discard &nbsp; W write &nbsp; M more like this &nbsp; Z undo</p>

      <MorningSwitch on={state.morning} onChange={(on) => setMorning(userId, on)} />
    </div>
  );
}

function MorningSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 border-t border-border/60 pt-4">
      <div className="min-w-0">
        <label htmlFor="ideas-morning" className="text-sm font-medium">Write today's ideas when I open the app</label>
        <p className="text-xs text-muted-foreground">{IDEAS_PRICE} a day</p>
      </div>
      <button
        id="ideas-morning"
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className="ml-auto flex h-11 w-14 shrink-0 items-center justify-end rounded-lg"
      >
        <span aria-hidden className={cn("relative inline-flex h-6 w-11 rounded-full transition-colors", on ? "bg-primary" : "bg-muted-foreground/30")}>
          <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform", on ? "translate-x-[22px]" : "translate-x-0.5")} />
        </span>
      </button>
    </div>
  );
}
