// /campaigns (plan-campaign, Leo only; docs/north-star/items/plan-campaign.md): the brand's campaigns. NEEDS YOU
// holds the ones with posts to review (or still being written), RUNNING the rest, DONE folds away. Each row shows
// its writing progress from the drafting job (src/lib/campaignJob.ts), which this visit resumes for any campaign
// with posts still to write. NO OPEN CAMPAIGN lists the saved audiences without one, each starting the wizard on
// step 2. GOAL sits under the H1 (?goal=change opens it); ?show=done unfolds DONE. Everyone else gets the 404 page.

import { useEffect, useReducer } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Plus } from "lucide-react";
import GoalLine from "@/components/GoalLine";
import { NoAudience } from "@/components/campaign/WhoStep";
import { Button } from "@/components/ui/button";
import { loadAudiences, onAudiencesChanged } from "@/lib/audiences";
import { draftingOf, onCampaignJob, PAUSED_LINE, startDrafting, type Drafting } from "@/lib/campaignJob";
import { campaignStatus, loadCampaigns, onCampaignsChanged, type Campaign, type CampaignStatus } from "@/lib/campaigns";
import { localDateKey } from "@/lib/dueDates";
import { LABEL_CHIP } from "@/lib/labels";
import { links } from "@/lib/links";
import { isPositioningUsable, loadPositioning } from "@/lib/positioning";
import { platformName } from "@/lib/socialConnect";
import { useUrlFlag } from "@/lib/urlState";
import { useLeoUser } from "@/lib/useLeoOnly";
import NotFoundPage from "@/pages/NotFoundPage";

const HEAD = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const STATUS: Record<CampaignStatus, { label: string; chip: string }> = {
  draft: { label: "Draft", chip: LABEL_CHIP.muted },
  running: { label: "Running", chip: LABEL_CHIP.primary },
  done: { label: "Done", chip: LABEL_CHIP.success },
};

export default function CampaignsPage() {
  const leo = useLeoUser();
  if (leo === undefined) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-9 w-48 rounded-md bg-muted" />
        {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}
      </div>
    );
  }
  if (!leo) return <NotFoundPage notOnAccount />;
  return <Campaigns userId={leo.id} />;
}

const toWrite = (c: Campaign) => c.posts.some((p) => p.state === "waiting" || p.state === "drafting");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The row's progress: writing, paused, or made and written; failed posts on a second line in the warning colour. */
function progressOf(c: Campaign, job: Drafting | null, now = Date.now()): { line: string; failed: string | null } {
  const count = (...states: string[]) => c.posts.filter((p) => states.includes(p.state)).length;
  const n = c.posts.length;
  const written = count("ready", "making", "made", "skipped");
  const failed = count("failed");
  const paused = job?.paused ?? (toWrite(c) && c.waitUntil && Date.parse(c.waitUntil) > now ? PAUSED_LINE : null);
  const line = paused ?? (toWrite(c) ? `Writing ${job?.done ?? written} of ${job?.of ?? n}` : `${count("made")} of ${n} made | ${written} written`);
  return { line, failed: failed ? `${plural(failed, "post")} could not be written` : null };
}

function Campaigns({ userId }: { userId: string }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [showDone, setShowDone] = useUrlFlag("show", "done");
  useEffect(() => {
    const offs = [onCampaignsChanged(redraw), onCampaignJob(redraw), onAudiencesChanged(redraw)];
    return () => offs.forEach((off) => off());
  }, []);
  // a closed tab left posts waiting or half written: this visit picks them up
  useEffect(() => {
    for (const c of loadCampaigns(userId)) if (toWrite(c)) startDrafting(userId, c.id);
  }, [userId]);

  const list = loadCampaigns(userId);
  const audiences = loadAudiences(userId);
  const today = localDateKey();
  const status = (c: Campaign) => campaignStatus(c, today);
  const needsYou = (c: Campaign) => status(c) === "draft" || c.posts.some((p) => p.state === "ready" || p.state === "failed");
  const open = list.filter((c) => status(c) !== "done");
  const groups = { needs: open.filter(needsYou), running: open.filter((c) => !needsYou(c)), done: list.filter((c) => status(c) === "done") };
  const counts = [
    `${list.filter((c) => status(c) === "running").length} running`,
    `${list.filter((c) => status(c) === "draft").length} planned`,
    ...(groups.done.length ? [`${groups.done.length} done`] : []),
  ].join(" | ");
  const free = audiences.filter((a) => !open.some((c) => c.audience === a.id));

  const row = (c: Campaign) => {
    const s = STATUS[status(c)];
    const p = progressOf(c, draftingOf(c.id));
    return (
      <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border/60 bg-card p-4 shadow-card">
        <div className="min-w-0 flex-1 basis-56">
          <Link to={links.campaign(c.id)} className="break-words font-medium hover:underline">{c.name}</Link>
          <p className="mt-0.5 break-words text-xs text-muted-foreground">
            {[c.audienceName, c.platforms.map(platformName).join(", ")].filter(Boolean).join(" | ")}
          </p>
        </div>
        <div className="min-w-0 basis-48 text-sm" aria-live="polite">
          <p className="tabular-nums">{p.line}</p>
          {p.failed && <p className="text-warning">{p.failed}</p>}
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.chip}`}>{s.label}</span>
        <Button asChild variant="outline" size="sm">
          <Link to={links.campaign(c.id)} aria-label={`Open ${c.name}`}>Open</Link>
        </Button>
      </li>
    );
  };
  const section = (label: string, items: Campaign[]) =>
    items.length > 0 && (
      <section className="space-y-2" aria-label={label}>
        <h2 className={HEAD}>{label} | {items.length}</h2>
        <ul className="space-y-2">{items.map(row)}</ul>
      </section>
    );

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Campaigns</h1>
          <Button asChild>
            <Link to={links.campaignNew()}>Plan a campaign</Link>
          </Button>
        </div>
        <GoalLine />
        {(list.length > 0 || audiences.length > 0) && (
          <p className="mt-2 text-sm text-muted-foreground">
            {list.length > 0 && `${counts} | `}
            <Link to="/audiences" className="font-medium text-foreground underline-offset-2 hover:underline">
              {audiences.length} {audiences.length === 1 ? "audience" : "audiences"}
            </Link>
          </p>
        )}
      </header>

      {!audiences.length && !list.length ? (
        <NoAudience positioningUsable={isPositioningUsable(loadPositioning(userId))} />
      ) : !list.length ? (
        <section aria-labelledby="first-h" className="space-y-3 rounded-xl border border-border/60 bg-card p-5 shadow-card">
          <div>
            <h2 id="first-h" className="font-serif text-xl">Plan your first campaign</h2>
            <p className="mt-1 text-sm text-muted-foreground">Pick who it should reach. Every post is written for you to check before anything goes out.</p>
          </div>
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {audiences.map((a) => (
              <li key={a.id}>
                <Link to={links.campaignNew({ audience: a.id })} className="flex min-h-11 items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-medium">{a.name}</span>
                    <span className="block text-xs text-muted-foreground">Start here.</span>
                  </span>
                  <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          {section("Needs you", groups.needs)}
          {section("Running", groups.running)}
          {free.length > 0 && (
            <section className="space-y-2" aria-label="No open campaign">
              <h2 className={HEAD}>No open campaign</h2>
              <div className="flex flex-wrap gap-2">
                {free.map((a) => (
                  <Button key={a.id} asChild variant="outline" size="sm">
                    <Link to={links.campaignNew({ audience: a.id })}>
                      <Plus aria-hidden /> {a.name}
                    </Link>
                  </Button>
                ))}
              </div>
            </section>
          )}
          {groups.done.length > 0 && (
            <div className="space-y-2">
              <Button variant="ghost" size="sm" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
                {showDone ? "Hide done" : `Show ${groups.done.length} done`}
              </Button>
              {showDone && section("Done", groups.done)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
