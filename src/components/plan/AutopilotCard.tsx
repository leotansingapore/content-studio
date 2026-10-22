// /plan's Autopilot card (plan-autopilot, Leo only), id "autopilot": off, on, writing, the week's posts waiting for an
// OK, paused, failed and done, all read from the brand's autopilot store and the run on this device. The run itself
// is autopilotJob.ts, so leaving the page never stops it. ?week=<monday> shows that week's batch (the newest one
// that has not ended, or the earlier one still waiting for an OK, when it is missing), ?autopilot=settings opens the
// settings dialog.
import { useEffect, useReducer, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ToastAction } from "@/components/ui/toast";
import ComplianceChips from "@/components/ComplianceChips";
import PriceChip from "@/components/PriceChip";
import AutopilotSettings, { AUTO_FORMAT_LABEL } from "@/components/plan/AutopilotSettings";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import { addDays, timeLabel } from "@/lib/dueDates";
import { draftsDropped } from "@/lib/campaigns";
import { slotLabel, WEEKDAYS } from "@/lib/contentPlan";
import { scanCompliance } from "@/lib/compliance";
import { loadDrafts, MAX_DRAFTS, type DraftEntry } from "@/lib/draftHistory";
import { getFunnelStage } from "@/data/funnelFramework";
import { loadGoals, sgDay, withGoalCadence } from "@/lib/goals";
import { loadLabels } from "@/lib/labels";
import { links } from "@/lib/links";
import { nearDuplicate } from "@/lib/nearDuplicate";
import { isPositioningUsable, loadPositioning } from "@/lib/positioning";
import { MAS_FLAG } from "@/lib/presenter";
import { useUrlItem } from "@/lib/urlState";
import { dayText, loadAutopilot, mondayOf, postsToWrite, saveSettings, weekText, type AutoFormat, type BatchPost } from "@/lib/autopilot";
import {
  approveAll,
  approvePost,
  autopilotRun,
  FAILED_POST_LINE,
  onAutopilot,
  PAUSED_LINE,
  runAutopilot,
  skipPost,
  tryAgain,
  turnOff,
  undoApprove,
} from "@/lib/autopilotJob";

const CHIP = "inline-flex items-center rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground";
const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Next week" for a week still to come, "This week" for the one running, "That week" for one gone. */
function weekWord(week: string, today: string): string {
  const now = mondayOf(today);
  return week > now ? "Next week" : week === now ? "This week" : "That week";
}

export default function AutopilotCard({ userId, onDraftsChange }: { userId: string; onDraftsChange?: (drafts: DraftEntry[]) => void }) {
  const { toast } = useToast();
  const [, redraw] = useReducer((x: number) => x + 1, 0);
  const [settingsParam, openSettings, closeSettings] = useUrlItem("autopilot");
  const [params] = useSearchParams();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  useEffect(() => onAutopilot(redraw), []);
  const run = autopilotRun(userId);
  const usesLeft = useUsesLeft(!!run.running);

  const now = new Date();
  const today = sgDay(now);
  const { settings, batches } = loadAutopilot(userId);
  const saved = loadPositioning(userId);
  const usable = isPositioningUsable(saved);
  const cadence = saved ? withGoalCadence(saved, loadGoals(userId)).cadence : 3;
  const drafts = loadDrafts(userId);
  const byId = new Map(drafts.map((d) => [d.id, d]));
  const labels = loadLabels(userId);
  const weekParam = params.get("week");
  // without ?week=: the earliest running week with posts to OK or to try again (daily mode can hold two), else the newest
  const open = batches.filter((b) => addDays(b.week, 6) >= today);
  const waiting = [...open].reverse().find((b) => b.posts.some((p) => p.state === "review" || p.state === "failed"));
  const shown = batches.find((b) => b.week === weekParam) ?? waiting ?? open[0] ?? null;
  const rows = (shown?.posts ?? []).filter((p) => p.state === "review" || p.state === "approved" || p.state === "missed" || p.state === "failed");
  const count = (s: BatchPost["state"]) => (shown?.posts ?? []).filter((p) => p.state === s).length;
  const review = count("review");
  const failed = count("failed");
  const paused = batches.some((b) => b.waitUntil && Date.parse(b.waitUntil) > now.getTime());
  const done =
    !!shown && count("approved") + count("skipped") + count("missed") > 0 && !review && !failed && !count("writing") && !postsToWrite(shown, drafts, today, settings).length;
  const dropped = draftsDropped(drafts.length, cadence);

  const changed = () => onDraftsChange?.(loadDrafts(userId));
  const off = () => {
    const undo = turnOff(userId);
    toast({
      title: "Autopilot is off.",
      action: (
        <ToastAction altText="Undo" onClick={undo}>
          Undo
        </ToastAction>
      ),
    });
  };
  const skip = (p: BatchPost) => {
    const undo = shown && skipPost(userId, shown.week, p.n);
    if (!undo) return;
    changed();
    toast({
      title: "Post skipped.",
      duration: 5000,
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => {
            undo();
            changed();
          }}
        >
          Undo
        </ToastAction>
      ),
    });
  };
  const press = (fn: () => unknown) => () => {
    fn();
    changed();
  };

  const subline = !settings.on
    ? "Writes next week's posts for you to OK. It never posts on its own."
    : settings.when === "daily"
      ? `Writes one day's posts each morning, ${plural(settings.windowDays, "day")} ahead.`
      : `Writes next week's ${plural(cadence, "post")} every ${WEEKDAYS[settings.writeDay]}. You OK each one ${plural(settings.windowDays, "day")} before it goes out.`;

  const row = (p: BatchPost) => {
    const d = byId.get(p.draftId);
    const stage = getFunnelStage(p.slot.stage);
    const label = slotLabel(p.slot, labels);
    // the lines after the first, which is the hook (a script's HOOK: line too)
    const body = d ? d.draft.split("\n").filter((l) => l.trim()).slice(1).join("\n") : "";
    const flags = d && p.state === "review" ? [...(p.mas ? [MAS_FLAG] : scanCompliance(d.draft))].filter((f) => !dismissed.has(`${p.draftId}:${f.id}`)) : [];
    const repeat = d && p.state === "review" ? nearDuplicate(d.draft, d.platform, drafts, d.id) : null;
    const lastDay = p.reviewBy === today;
    const edit = links.generate({ draft: p.draftId });
    return (
      <li key={p.n} className="space-y-2 rounded-lg border border-border/60 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={CHIP}>
            {dayText(p.day)}
            {p.time && ` ${timeLabel(p.time)}`}
          </span>
          <span className={CHIP}>{AUTO_FORMAT_LABEL[p.slot.format as AutoFormat] ?? p.slot.format}</span>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stage.accent.badge}`}>
            {stage.letter} {stage.label}
          </span>
          {label && <span className={CHIP}>{label.name}</span>}
          {p.state === "approved" && <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">Approved</span>}
        </div>
        {p.state === "failed" ? (
          <p className="text-sm text-muted-foreground">{FAILED_POST_LINE}</p>
        ) : (
          <div className="space-y-1">
            {d && (
              <Link to={p.state === "approved" ? links.calendar({ post: p.draftId }) : edit} className="block text-sm font-semibold leading-snug text-foreground hover:underline">
                {d.hook}
              </Link>
            )}
            {body && <p className="line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{body}</p>}
          </div>
        )}
        {flags.length > 0 && <ComplianceChips flags={flags} onDismiss={(id) => setDismissed((s) => new Set(s).add(`${p.draftId}:${id}`))} />}
        {repeat && (
          <p className="flex items-start gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {repeat.percent}% the same words as your post "{repeat.post.hook.length > 40 ? `${repeat.post.hook.slice(0, 40).trim()}...` : repeat.post.hook}". Near copies reach fewer people.
          </p>
        )}
        {p.state === "review" && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={`text-xs ${lastDay ? "font-semibold text-warning" : "text-muted-foreground"}`}>OK by {lastDay ? "today" : dayText(p.reviewBy)}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className={TOUCH} onClick={press(() => shown && approvePost(userId, shown.week, p.n))}>
                Approve
              </Button>
              <Button size="sm" variant="outline" className={TOUCH} asChild>
                <Link to={edit}>Edit</Link>
              </Button>
              <Button size="sm" variant="ghost" className={`text-muted-foreground ${TOUCH}`} onClick={() => skip(p)}>
                Skip
              </Button>
            </div>
          </div>
        )}
        {p.state === "approved" && (
          <Button size="sm" variant="ghost" className={`-ml-2 ${TOUCH}`} onClick={press(() => shown && undoApprove(userId, shown.week, p.n))}>
            Undo
          </Button>
        )}
        {p.state === "missed" && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Not approved in time. It is in My posts as a draft.</p>
            <Button size="sm" variant="outline" className={TOUCH} asChild>
              <Link to={edit}>Open</Link>
            </Button>
          </div>
        )}
      </li>
    );
  };

  return (
    <Card id="autopilot" className="scroll-mt-20 border-border/60 shadow-card">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-lg font-semibold">Autopilot</h3>
              <span className={settings.on ? "rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success" : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"}>
                {settings.on ? "On" : "Off"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {settings.on && (
                <Button size="sm" variant="ghost" className={`text-muted-foreground ${TOUCH}`} onClick={off}>
                  Turn off
                </Button>
              )}
              {settings.on ? (
                <Button size="sm" variant="outline" className={TOUCH} onClick={() => openSettings("settings")}>
                  Settings
                </Button>
              ) : (
                <Button size="sm" variant="outline" className={TOUCH} disabled={!usable} onClick={() => openSettings("settings")}>
                  Turn on
                </Button>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{subline}</p>
        </div>

        {!usable ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-sm">Say who you serve first, so the posts are about them.</p>
            <Button size="sm" variant="outline" className={TOUCH} asChild>
              <Link to={links.plan({ view: "setup" })}>Set up positioning</Link>
            </Button>
          </div>
        ) : (
          settings.on && (
            <>
              {run.running ? (
                <div className="space-y-1.5" role="status">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Writing next week's posts... {run.running.done} of {run.running.of}
                  </p>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(8, (run.running.done / run.running.of) * 100)}%` }} />
                  </div>
                </div>
              ) : paused ? (
                <p className="text-sm font-medium text-warning" role="status">
                  {PAUSED_LINE}
                </p>
              ) : run.error ? (
                <div className="flex flex-wrap items-center justify-between gap-2" role="alert">
                  <p className="text-sm text-destructive">{run.error}</p>
                  <Button size="sm" variant="outline" className={TOUCH} onClick={() => void tryAgain(userId)}>
                    Try again
                  </Button>
                </div>
              ) : !rows.length && run.planned ? (
                <p className="text-sm">Next week already has {plural(run.planned, "post")} planned. Nothing to write.</p>
              ) : null}
              {!rows.length && !run.running && dropped > 0 && (
                <p className="text-xs text-warning">
                  My posts keeps your newest {MAX_DRAFTS}, so this week's posts push out your {plural(dropped, "oldest", "oldest")}.
                </p>
              )}
              {shown && rows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {weekWord(shown.week, today)} | {weekText(shown.week)}
                      {review > 0 && ` | ${review} for your OK`}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {failed > 0 && !run.running && (
                        <>
                          <PriceChip feature="campaign-draft" left={usesLeft("campaign-draft")} />
                          <Button size="sm" variant="outline" className={TOUCH} onClick={() => void tryAgain(userId)}>
                            Try again
                          </Button>
                        </>
                      )}
                      {review > 0 && (
                        <Button size="sm" className={TOUCH} onClick={press(() => approveAll(userId, shown.week))}>
                          Approve all
                        </Button>
                      )}
                    </div>
                  </div>
                  {done && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-success/5 px-3 py-2">
                      <p className="text-sm font-medium">
                        {weekWord(shown.week, today)} is set. {count("approved")} approved, {count("skipped")} skipped{count("missed") ? `, ${count("missed")} missed` : ""}.
                      </p>
                      <Button size="sm" variant="outline" className={TOUCH} asChild>
                        <Link to={links.calendar({ view: "week", week: shown.week })}>See the week</Link>
                      </Button>
                    </div>
                  )}
                  <ul className="space-y-2">{rows.map(row)}</ul>
                </div>
              )}
            </>
          )
        )}

        {settingsParam === "settings" && (usable || settings.on) && (
          <AutopilotSettings
            settings={settings}
            cadence={cadence}
            onClose={closeSettings}
            onSave={(next) => {
              const line = saveSettings(userId, next);
              if (line) return line;
              closeSettings();
              void runAutopilot(userId);
              return null;
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
