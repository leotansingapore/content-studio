// Configure on a campaign page (?configure=1, Leo's sign-ins), Fastlane's campaign settings sheet from the right: the
// name, kept when the field is left, then pace and length, saved together with Undo because a shorter plan drops posts
// (written posts keep their words on the new days and new slots are written by the campaign job, replanCampaign; pace
// and length lock once a post is made or while words are being written, replanLock). Then the time zone posts go out
// in, the accounts (one more can be added from the brand's connected ones until launch), the angles with their post
// counts, the ads, the audience, the post choices, and at the foot a message to the agent about this campaign.

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { MinusIcon, PaperPlaneTiltIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { ROW, dot, rowOn } from "@/components/campaign/WhoStep";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { loadAudiences } from "@/lib/audiences";
import { browserTimeZone, zoneName } from "@/lib/autoPost";
import { adCounts, adViews, layoutMix } from "@/lib/campaignAds";
import { startDrafting } from "@/lib/campaignJob";
import {
  type Campaign, angleCounts, CAMPAIGN_ACCOUNTS, hasWords, loadCampaigns, replanCampaign, replanLock, restoreCampaign, saveCampaigns, withAccount,
} from "@/lib/campaigns";
import { MAX_NAME, MAX_WEEKS, MIN_WEEKS, PACES, paceLabel } from "@/lib/campaignWizard";
import { timeLabel } from "@/lib/dueDates";
import { imageWrite, loadImages } from "@/lib/images";
import { absolute, links } from "@/lib/links";
import { activeProfileId } from "@/lib/profiles";
import { platformName, socialStatus, type AccountView } from "@/lib/socialConnect";

const HEAD = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const LINK = "inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline sm:min-h-0";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const handle = (a: AccountView) => (a.username ? `@${a.username.replace(/^@/, "")}` : a.name);

/** What saving this pace and length does: the new count, then the written posts it drops and the new ones it writes. */
export function replanLine(c: Pick<Campaign, "posts" | "runs">, weeks: number, perWeek: number): string {
  if (c.runs === "ads") return `The ads run ${plural(weeks, "week")}.`;
  const count = weeks * perWeek;
  const dropped = c.posts.slice(count).filter(hasWords).length;
  const added = Math.max(0, count - c.posts.length);
  return [
    `${plural(count, "post")} over ${plural(weeks, "week")}.`,
    dropped > 0 && `Drops ${plural(dropped, "written post")} at the end.`,
    added > 0 && `${plural(added, "new post")} get written.`,
  ].filter(Boolean).join(" ");
}

/** "At 9am and 7pm, SGT.": the times the posts go out at, in the zone this device posts in. */
export function postTimesLine(c: Pick<Campaign, "posts">, zone: string): string {
  const times = [...new Set(c.posts.filter((p) => p.state !== "skipped" && p.time).map((p) => p.time!))].sort();
  if (!times.length) return `Each post goes out on its day, ${zone}.`;
  const shown = times.slice(0, 3).map(timeLabel);
  const list = times.length > 3 ? `${shown.join(", ")} and ${times.length - 3} more times` : shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}` : shown[0];
  return `At ${list}, ${zone}.`;
}

/** The message the foot's Send hands a new agent chat: what was typed, then which campaign, with its link. */
export const agentAsk = (c: Pick<Campaign, "id" | "name">, typed: string) => `${typed.trim()}\n\nThis is about my campaign "${c.name}": ${absolute(links.campaign(c.id))}`;

export default function ConfigurePanel({ userId, campaign: c, onClose }: { userId: string; campaign: Campaign; onClose: () => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [weeks, setWeeks] = useState(c.weeks);
  const [perWeek, setPerWeek] = useState<Campaign["perWeek"]>(c.perWeek);
  const [ask, setAsk] = useState("");
  const [adding, setAdding] = useState(false);
  const [accounts, setAccounts] = useState<AccountView[] | "loading" | "failed">("loading");
  const lock = replanLock(c);
  const changed = weeks !== c.weeks || perWeek !== c.perWeek;
  const picked = c.accountIds ?? [];
  const from = { label: c.name, path: links.campaign(c.id) };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // the brand's connected accounts, read once while the sheet is open (one social-read)
  useEffect(() => {
    let live = true;
    socialStatus(activeProfileId(userId)).then((s) => live && setAccounts(s.accounts), () => live && setAccounts("failed"));
    return () => {
      live = false;
    };
  }, [userId]);

  const save = (next: Campaign) => saveCampaigns(userId, loadCampaigns(userId).map((x) => (x.id === c.id ? next : x)));
  const rename = (value: string) => {
    const name = value.trim().slice(0, MAX_NAME);
    if (!name || name === c.name) return;
    const line = save({ ...c, name });
    toast(line ? { title: line, variant: "destructive" } : { title: "Name saved." });
  };
  const replan = () => {
    const before = c;
    const next = replanCampaign(userId, c, { weeks, perWeek });
    const line = save(next);
    if (line) return toast({ title: line, variant: "destructive" });
    // shortcut: an Undo while a batch is in flight can land its words on the old plan's post of the same number; fine while Leo-only
    startDrafting(userId, c.id);
    toast({
      title: c.runs === "ads" ? `The ads run ${plural(weeks, "week")} now.` : `Now ${plural(next.posts.length, "post")} over ${plural(weeks, "week")}, ${paceLabel(perWeek)}.`,
      duration: 6000,
      action: (
        <ToastAction altText="Undo" onClick={() => {
          const undo = restoreCampaign(userId, before);
          if (undo) toast({ title: undo, variant: "destructive" });
          else {
            setWeeks(before.weeks);
            setPerWeek(before.perWeek);
          }
        }}>
          Undo
        </ToastAction>
      ),
    });
  };
  const addAccount = (a: AccountView) => {
    const next = withAccount(c, a);
    if (!next) return;
    const line = save(next);
    if (line) return toast({ title: line, variant: "destructive" });
    setAdding(false);
    toast({ title: `${handle(a)} posts for this campaign after launch.` });
  };
  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!ask.trim()) return;
    navigate(links.agent({ ask: agentAsk(c, ask) }), { state: { send: true, from } });
  };

  const who = loadAudiences(userId).find((a) => a.id === c.audience)?.who || c.audienceName;
  const ads = c.ads?.length ? adViews(c, loadImages(userId), imageWrite()) : [];
  const live = ads.length ? adCounts(ads).live : 0;
  const read = Array.isArray(accounts) ? accounts : [];
  const pickedRows = picked.map((id) => ({ id, a: read.find((x) => x.id === id) }));
  const others = read.filter((a) => !picked.includes(a.id) && !a.needsReconnect);
  const canAdd = !c.launchedAt && picked.length < CAMPAIGN_ACCOUNTS;
  const summary = c.runs === "ads"
    ? plural(c.weeks, "week")
    : [plural(c.weeks, "week"), paceLabel(c.perWeek), plural(picked.length, "account"), plural(c.posts.length, "post")].join(" | ");

  const accountsBody = () => {
    if (accounts === "loading") return <div className="h-11 animate-pulse rounded-lg bg-muted/50" aria-busy="true" />;
    return (
      <div className="space-y-2">
        {pickedRows.length > 0 ? (
          <ul className="space-y-1.5">
            {pickedRows.map(({ id, a }) => (
              <li key={id} className="min-w-0 rounded-lg border border-border/60 px-3 py-2 text-sm">
                <span className="block break-words font-medium">{a ? handle(a) : accounts === "failed" ? "A picked account" : "An account no longer connected"}</span>
                <span className={`block text-xs ${a?.needsReconnect || (!a && accounts !== "failed") ? "text-destructive" : "text-muted-foreground"}`}>
                  {a ? `${platformName(a.platform)} | ${a.needsReconnect ? "Reconnect it on Social accounts" : c.launchedAt ? "Posting" : "Posts after launch"}` : accounts === "failed" ? "Couldn't check it" : "Remove it on Social accounts"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">You post these yourself.</p>
        )}
        {accounts === "failed" ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t read your connected accounts.</p>
        ) : !read.length ? (
          <Link to={links.accounts()} className={LINK}>Connect an account</Link>
        ) : canAdd && others.length > 0 ? (
          adding ? (
            <div role="group" aria-label="Add an account" className="space-y-1.5">
              {others.map((a) => (
                <button key={a.id} type="button" onClick={() => addAccount(a)} className={`${ROW} items-center ${rowOn(false)}`}>
                  <PlusIcon aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 break-words">{handle(a)}</span>
                  <span className="text-xs text-muted-foreground">{platformName(a.platform)}</span>
                </button>
              ))}
              <Button variant="ghost" size="sm" className="h-11 sm:h-9" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="h-11 gap-1.5 sm:h-9" onClick={() => setAdding(true)}>
              <PlusIcon aria-hidden className="h-4 w-4" /> Add an account
            </Button>
          )
        ) : null}
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="configure-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50 animate-in fade-in-0 motion-reduce:animate-none" />
      <div id="configure" className="relative flex h-full w-full flex-col bg-background shadow-xl animate-in slide-in-from-right duration-200 motion-reduce:animate-none sm:max-w-[480px] sm:border-l sm:border-border/70">
        <header className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="min-w-0">
            <h2 id="configure-title" className="text-base font-semibold text-foreground">Campaign settings</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{summary}</p>
          </div>
          <Button variant="ghost" size="icon" autoFocus className="h-11 w-11 shrink-0 sm:h-10 sm:w-10" aria-label="Close campaign settings" onClick={onClose}>
            <XIcon className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
          <div className="space-y-1.5">
            <label htmlFor="campaign-name" className={HEAD}>Name</label>
            <Input
              id="campaign-name"
              key={c.name}
              defaultValue={c.name}
              maxLength={MAX_NAME}
              className="h-11"
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              onBlur={(e) => rename(e.currentTarget.value)}
            />
          </div>

          <div className="space-y-4">
            <fieldset disabled={!!lock} className="space-y-5 disabled:opacity-60">
              <div className={c.runs === "ads" ? "hidden" : "space-y-2"}>
                <p id="cfg-pace" className={HEAD}>Pace, per account</p>
                <div role="radiogroup" aria-labelledby="cfg-pace" className="grid grid-cols-2 gap-1.5">
                  {PACES.map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={perWeek === n} onClick={() => setPerWeek(n)} className={`${ROW} items-center ${rowOn(perWeek === n)}`}>
                      <span aria-hidden className={`${dot(perWeek === n)} mt-0`} />
                      {paceLabel(n)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p id="cfg-length" className={HEAD}>Length</p>
                <div className="flex items-center gap-2" role="group" aria-labelledby="cfg-length">
                  <Button type="button" variant="outline" size="icon" className="h-11 w-11 sm:h-10 sm:w-10" aria-label="One week shorter" disabled={weeks <= MIN_WEEKS} onClick={() => setWeeks(weeks - 1)}>
                    <MinusIcon />
                  </Button>
                  <span className="min-w-[5.5rem] text-center font-semibold tabular-nums" aria-live="polite">{plural(weeks, "week")}</span>
                  <Button type="button" variant="outline" size="icon" className="h-11 w-11 sm:h-10 sm:w-10" aria-label="One week longer" disabled={weeks >= MAX_WEEKS} onClick={() => setWeeks(weeks + 1)}>
                    <PlusIcon />
                  </Button>
                </div>
              </div>
            </fieldset>
            <div className="flex flex-wrap items-center gap-3">
              <Button className="h-11 sm:h-10" disabled={!!lock || !changed} onClick={replan}>{c.runs === "ads" ? "Save length" : "Save pace and length"}</Button>
              <p className="min-w-0 flex-1 text-sm text-muted-foreground" aria-live="polite">{lock ?? (changed ? replanLine(c, weeks, perWeek) : replanLine(c, c.weeks, c.perWeek))}</p>
            </div>
          </div>

          {c.runs !== "ads" && (
            <section aria-labelledby="cfg-times" className="space-y-1.5">
              <h3 id="cfg-times" className={HEAD}>Post times</h3>
              <p className="text-sm">{postTimesLine(c, zoneName(browserTimeZone()))}</p>
            </section>
          )}

          {c.runs !== "ads" && (
            <section aria-labelledby="cfg-accounts" className="space-y-2">
              <h3 id="cfg-accounts" className={HEAD}>Accounts</h3>
              {accountsBody()}
            </section>
          )}

          <section aria-labelledby="cfg-angles" className="space-y-2">
            <h3 id="cfg-angles" className={HEAD}>Angles</h3>
            <ul className="space-y-1">
              {angleCounts(c).map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words">{a.title}</span>
                  {c.runs !== "ads" && <span className="shrink-0 tabular-nums text-muted-foreground">{plural(a.count, "post")}</span>}
                </li>
              ))}
            </ul>
            <Link to={links.agent({ ask: agentAsk(c, "Change the angles of this campaign: ") })} state={{ from }} className={LINK}>
              Ask the agent to change them
            </Link>
          </section>

          <section aria-labelledby="cfg-ads" className="space-y-1.5">
            <h3 id="cfg-ads" className={HEAD}>Ads</h3>
            <p className="text-sm">{live ? `${plural(live, "ad")}. ${layoutMix(ads)}.` : "None. This campaign posts only."}</p>
          </section>

          <section aria-labelledby="cfg-who" className="space-y-1.5">
            <h3 id="cfg-who" className={HEAD}>Audience</h3>
            <p className="text-sm">{who || "Not set"}</p>
          </section>

          <section aria-labelledby="cfg-choices" className="space-y-1">
            <h3 id="cfg-choices" className={HEAD}>Post choices</h3>
            <p className="text-sm">All follow your brand&apos;s post choices.</p>
            <Link to="/settings/post-choices" className={LINK}>Change post choices</Link>
          </section>
        </div>

        <form onSubmit={send} className="flex items-center gap-2 border-t border-border/70 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
          <Input value={ask} onChange={(e) => setAsk(e.target.value)} maxLength={500} placeholder="Ask the agent to change anything else" aria-label="Ask the agent to change anything else" className="h-11 min-w-0 flex-1" />
          <Button type="submit" className="h-11 shrink-0 gap-1.5" disabled={!ask.trim()}>
            <PaperPlaneTiltIcon aria-hidden className="h-4 w-4" /> Send
          </Button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
