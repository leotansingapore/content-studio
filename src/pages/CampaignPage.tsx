// One campaign (/campaigns/:id, Leo's sign-ins only; docs/north-star/items/plan-campaign-page.md): the header with
// Launch campaign (?launch=1: the dialog, then src/lib/campaignLaunch.ts; once launched, Pause or Resume),
// Configure (?configure=1: the settings sheet from the right, ConfigurePanel), Rename and Delete (Undo), the paused and finished states, then, in
// Fastlane's order, the review queue under #queue (Review, or All posts with the ads group first), the ads group under
// the deck in Review (?ads=all, ?ads=send; src/components/campaign/AdsGroup.tsx), and the cost, where and goal panels
// on one row last. Ads only shows the ads group alone. Opening it resumes any posts still to be written
// (src/lib/campaignJob.ts, outside React). ?angle= filters the queue; ?post= and ?view= are the queue's own.
// Everyone else gets the 404 page.

import { useEffect, useReducer, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { DotsThreeIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import AdsGroup from "@/components/campaign/AdsGroup";
import CampaignQueue from "@/components/campaign/CampaignQueue";
import ConfigurePanel from "@/components/campaign/ConfigurePanel";
import LaunchDialog from "@/components/campaign/LaunchDialog";
import CostPanel from "@/components/campaign/CostPanel";
import GoalPanel from "@/components/campaign/GoalPanel";
import WherePanel from "@/components/campaign/WherePanel";
import CopyLinkButton from "@/components/CopyLinkButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { adsMade } from "@/lib/campaignAds";
import { draftingOf, onCampaignJob, PAUSED_LINE, startDrafting } from "@/lib/campaignJob";
import { launchCampaign, pauseCampaign, type LaunchOutcome } from "@/lib/campaignLaunch";
import {
  type Campaign, campaignStatus, deleteCampaign, getCampaign, loadCampaigns, onCampaignsChanged, restoreCampaign, saveCampaigns,
} from "@/lib/campaigns";
import { loadAudiences } from "@/lib/audiences";
import { runsLabel } from "@/lib/campaignWizard";
import { keyToDate, localDateKey } from "@/lib/dueDates";
import { onImagesChanged } from "@/lib/images";
import { links } from "@/lib/links";
import { platformName } from "@/lib/socialConnect";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useScrollToHash, useUrlItem, useUrlState } from "@/lib/urlState";
import NotFoundPage from "@/pages/NotFoundPage";

const STATUS = { draft: "Draft", running: "Running", done: "Done" } as const;
const NAME_MAX = 80;
const BIG = "h-11 sm:h-10";
const CHIP = "rounded-full border border-border/70 px-2.5 py-0.5 text-xs font-medium";
const dayText = (day: string) => keyToDate(day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

export default function CampaignPage() {
  const leo = useLeoUser();
  const { id = "" } = useParams();
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage notOnAccount />;
  return <CampaignView userId={leo.id} id={id} />;
}

/** The finished card's line: how many went on the calendar, first day to last. */
function finishedLine(c: Pick<Campaign, "posts">): string {
  const days = c.posts.filter((p) => p.state === "made").map((p) => p.day).sort();
  if (!days.length) return "Every post is made or skipped. None went on your calendar.";
  return `Every post is made or skipped. ${days.length} went on your calendar, ${dayText(days[0])} to ${dayText(days[days.length - 1])}.`;
}

function CampaignView({ userId, id }: { userId: string; id: string }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    // a made ad's design lands in Your images: the status chip counts it
    const offs = [onCampaignsChanged(redraw), onCampaignJob(redraw), onImagesChanged(redraw)];
    return () => offs.forEach((off) => off());
  }, []);
  // a closed tab or a limit left posts to write: this visit picks them up (a no-op when nothing waits)
  useEffect(() => startDrafting(userId, id), [userId, id]);

  const c = getCampaign(userId, id);
  const [angle, setAngle] = useUrlState("angle", "", { allowed: c?.angles.map((a) => a.id) ?? [] });
  useScrollToHash(!!c);

  const [menu, setMenu] = useState<"closed" | "open" | "confirm">("closed");
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (menu !== "open") return;
    const away = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setMenu("closed");
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [menu]);
  const [renaming, setRenaming] = useState(false);
  const [configure, openConfigure, closeConfigure] = useUrlItem("configure");
  const [launchOpen, openLaunch, closeLaunch] = useUrlItem("launch");
  const [switching, setSwitching] = useState<"pause" | "resume" | null>(null);
  // Launch saves launchedAt before its sends finish: the dialog stays open until they do
  const [launching, setLaunching] = useState(false);
  const grid = useSearchParams()[0].get("view") === "grid";
  const cancelled = useRef(false);

  if (!c) {
    return (
      <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-border/60 p-6 text-center shadow-card">
        <p className="text-base">This campaign isn&apos;t here. It may have been deleted on another device.</p>
        <Button asChild className={BIG}>
          <Link to={links.campaigns()}>Back to campaigns</Link>
        </Button>
      </div>
    );
  }

  const status = campaignStatus(c, localDateKey(), c.ads?.length ? adsMade(userId, c) : 0);
  const who = loadAudiences(userId).find((a) => a.id === c.audience)?.who || c.audienceName;
  const paused = c.waitUntil && Date.now() < Date.parse(c.waitUntil) ? PAUSED_LINE : draftingOf(c.id)?.paused;
  const finished = c.posts.length > 0 && c.posts.every((p) => p.state === "made" || p.state === "skipped");
  const ads = c.ads?.length ? <AdsGroup userId={userId} campaign={c} /> : null;

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  /** What Launch or Resume did, as a toast: what went to the accounts, and the first reason any could not. */
  const launched = (out: LaunchOutcome, again: boolean) => {
    if ("error" in out) return toast({ title: out.error, variant: "destructive" });
    const head = again ? "Running again." : "Launched.";
    const went = c.accountIds?.length
      ? out.sent ? `${plural(out.sent, "post is", "posts are")} scheduled on your accounts.` : "Posts go to your accounts as you make them."
      : "Each made post is on your calendar on its day.";
    const failed = out.failed.length ? ` ${plural(out.failed.length, "post", "posts")} could not be scheduled: ${out.failed[0].error}` : "";
    toast({ title: head, description: `${went}${failed}`, ...(out.failed.length ? { variant: "destructive" as const } : {}) });
  };
  const pause = async () => {
    setSwitching("pause");
    const out = await pauseCampaign(userId, c.id);
    setSwitching(null);
    if ("error" in out) return toast({ title: out.error, variant: "destructive" });
    toast({
      title: "Paused.",
      description: [
        out.cancelled ? `${plural(out.cancelled, "scheduled post", "scheduled posts")} came off your accounts. Resume sends ${out.cancelled === 1 ? "it" : "them"} again.` : "Nothing new goes out until you resume.",
        out.failed ? `${plural(out.failed, "post", "posts")} could not be taken off. Cancel ${out.failed === 1 ? "it" : "them"} from the post.` : "",
      ].filter(Boolean).join(" "),
    });
  };
  const resume = async () => {
    setSwitching("resume");
    const out = await launchCampaign(userId, c.id);
    setSwitching(null);
    launched(out, true);
  };

  const rename = (value: string) => {
    setRenaming(false);
    const name = value.trim().slice(0, NAME_MAX);
    if (!name || name === c.name) return;
    const line = saveCampaigns(userId, loadCampaigns(userId).map((x) => (x.id === c.id ? { ...x, name } : x)));
    if (line) toast({ title: line, variant: "destructive" });
  };
  const remove = () => {
    setMenu("closed");
    const gone = deleteCampaign(userId, c.id);
    if (!gone) return toast({ title: "Couldn't delete it. Try again.", variant: "destructive" });
    navigate(links.campaigns());
    toast({
      title: "Campaign deleted.",
      duration: 5000,
      action: (
        <ToastAction altText="Undo" onClick={() => {
          const line = restoreCampaign(userId, gone);
          if (line) toast({ title: line, variant: "destructive" });
          else startDrafting(userId, gone.id);
        }}>
          Undo
        </ToastAction>
      ),
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link to={links.campaigns()} className="inline-flex min-h-11 items-center text-primary hover:underline sm:min-h-0">Campaigns</Link>
        </nav>
        <header className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <div className="min-w-0 flex-[1_1_320px] space-y-1.5">
            <div className="flex items-center gap-1">
              {renaming ? (
                <Input
                  autoFocus
                  defaultValue={c.name}
                  maxLength={NAME_MAX}
                  aria-label="Campaign name"
                  className="h-11 font-serif text-xl font-semibold sm:text-2xl"
                  onFocus={() => (cancelled.current = false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      cancelled.current = true;
                      setRenaming(false);
                    }
                  }}
                  onBlur={(e) => !cancelled.current && rename(e.currentTarget.value)}
                />
              ) : (
                <h1 className="min-w-0 font-serif text-2xl font-semibold leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{c.name}</h1>
              )}
              <CopyLinkButton label="Copy link to this campaign" className="shrink-0" />
            </div>
            <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {[who, `${c.weeks} ${c.weeks === 1 ? "week" : "weeks"}`, c.platforms.map(platformName).join(", "), c.runs && c.runs !== "organic" ? runsLabel(c.runs) : ""]
                .filter(Boolean)
                .join(" | ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {c.platforms.map((p) => <span key={p} className={CHIP}>{platformName(p)}</span>)}
            <span className={`${CHIP} ${status === "running" && c.pausedAt ? "border-warning/40 bg-warning/10 text-warning" : status === "running" ? "border-primary/40 bg-primary/10 text-primary" : status === "done" ? "border-success/40 bg-success/10 text-success" : "bg-muted/50"}`}>
              {status === "running" && c.pausedAt ? "Paused" : STATUS[status]}
            </span>
            {c.runs !== "ads" && c.posts.length > 0 && status !== "done" && (
              !c.launchedAt ? (
                <Button className={BIG} onClick={() => openLaunch("1")}>Launch campaign</Button>
              ) : c.pausedAt ? (
                <Button className={`${BIG} gap-1.5`} disabled={!!switching || launching} onClick={() => void resume()}>
                  {switching === "resume" ? "Resuming..." : "Resume"}
                </Button>
              ) : (
                <Button variant="outline" className={BIG} disabled={!!switching || launching} onClick={() => void pause()}>
                  {switching === "pause" ? "Pausing..." : "Pause"}
                </Button>
              )
            )}
            <Button variant="ghost" className={`${BIG} gap-1.5 ${configure === "1" ? "bg-accent" : ""}`} aria-expanded={configure === "1"} aria-controls="configure"
              onClick={() => (configure === "1" ? closeConfigure() : openConfigure("1"))}>
              <SlidersHorizontalIcon className="h-4 w-4" aria-hidden /> Configure
            </Button>
            <div ref={menuRef} className="relative">
              <Button variant="ghost" size="icon" className="h-11 w-11 sm:h-10 sm:w-10" aria-label="More for this campaign" aria-haspopup="menu" aria-expanded={menu === "open"}
                onClick={() => setMenu(menu === "open" ? "closed" : "open")}>
                <DotsThreeIcon className="h-4 w-4" />
              </Button>
              {menu === "open" && (
                <div role="menu" aria-label="More for this campaign" onKeyDown={(e) => e.key === "Escape" && setMenu("closed")}
                  className="absolute right-0 top-full z-30 mt-1 w-48 rounded-xl border border-border/70 bg-popover p-1 shadow-elegant">
                  {[
                    { label: "Rename", run: () => (setMenu("closed"), setRenaming(true)) },
                    { label: "Delete campaign", run: () => setMenu("confirm") },
                  ].map((it) => (
                    <button key={it.label} type="button" role="menuitem" onClick={it.run}
                      className="flex h-11 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none sm:h-9">
                      {it.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>
        {menu === "confirm" && (
          <div role="alertdialog" aria-label="Delete this campaign" className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm">Delete this campaign? Posts you made stay in All posts and on your calendar.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" className={BIG} onClick={remove}>Delete campaign</Button>
              <Button variant="ghost" className={BIG} onClick={() => setMenu("closed")}>Keep</Button>
            </div>
          </div>
        )}
      </div>

      {configure === "1" && <ConfigurePanel userId={userId} campaign={c} onClose={closeConfigure} />}
      {launchOpen === "1" && (!c.launchedAt || launching) && (
        <LaunchDialog userId={userId} campaign={c} onClose={closeLaunch} onBusy={setLaunching} onDone={(out) => {
          if (out.ok) closeLaunch();
          launched(out, false);
        }} />
      )}

      {c.pausedAt && (
        <p role="status" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">Paused. Nothing new goes out until you resume.</p>
      )}

      {paused && (
        <p role="status" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">{paused}</p>
      )}

      {finished && (
        <section aria-label="Campaign finished" className="space-y-3 rounded-xl border border-border/60 p-5 shadow-card">
          <p className="text-base">{finishedLine(c)}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className={BIG}>
              <Link to={links.calendar({ view: "upcoming" })}>Open calendar</Link>
            </Button>
            <Button asChild className={BIG}>
              <Link to={links.campaignNew({ audience: c.audience })}>Plan the next campaign</Link>
            </Button>
          </div>
        </section>
      )}

      {c.runs === "ads" ? ads : (
        <>
          <section id="queue" aria-label="Review queue" className="scroll-mt-20">
            <CampaignQueue userId={userId} campaign={c} angle={angle || null} ads={grid ? ads : null} />
          </section>

          {!grid && ads}

          {/* one row from lg up (cost, where, goal); stacked below as cost, goal, where */}
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <div className="order-1 min-w-0 empty:hidden"><CostPanel userId={userId} campaign={c} /></div>
            <div className="order-3 min-w-0 empty:hidden lg:order-2"><WherePanel userId={userId} campaign={c} /></div>
            <div className="order-2 min-w-0 empty:hidden lg:order-3">
              <GoalPanel userId={userId} campaign={c} angle={angle || null} onAngle={(a) => setAngle(a ?? "")} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
