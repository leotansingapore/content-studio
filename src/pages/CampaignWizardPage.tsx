// /campaigns/new (plan-campaign, Leo only; docs/north-star/items/plan-campaign.md): plan a campaign in five steps,
// one open at a time in a 680 px column. ?step= is the open step (replace; the first unfinished by default) and
// ?audience=<id> answers step 1 once. Every answer waits in cs-campaign-wizard-<scoped> (src/lib/campaignWizard.ts)
// until Add or Start over. Add lays the campaign out (planCampaign), keeps it (addCampaign) and starts writing its
// words outside React (startDrafting), so the result card can be left at once. Everyone else gets the 404 page.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import AnglesStep from "@/components/campaign/AnglesStep";
import PaceStep from "@/components/campaign/PaceStep";
import ReviewStep, { AddedCard } from "@/components/campaign/ReviewStep";
import WhereStep, { defaultAccounts, useAccounts } from "@/components/campaign/WhereStep";
import WhoStep, { NoAudience } from "@/components/campaign/WhoStep";
import { Button } from "@/components/ui/button";
import { useUsesLeft } from "@/lib/aiUsage";
import { saveWork } from "@/lib/angleSuggest";
import { anglesFor } from "@/lib/angles";
import { loadAudiences, onAudiencesChanged } from "@/lib/audiences";
import { startDrafting } from "@/lib/campaignJob";
import {
  addCampaign, campaignCost, LIMIT_LINE, loadCampaigns, MAX_CAMPAIGNS, planCampaign, videosLeft, winnersFor, type Campaign, type CampaignAsk,
} from "@/lib/campaigns";
import {
  addedLine, confirmed, costLine, defaultName, firstOpen, FORMAT_NAME, formatLine, freshAngles, listJoin, loadWizard, nearestPace, newWork, openStep,
  paceLabel, pickAudience, previewPosts, saveWizard, shortDay, STEP_LABEL, STEPS, successLine, summaryLines, whereLine, withAudience, withoutAudience,
  writeLimitLine, type WizardStep, type WizardWork,
} from "@/lib/campaignWizard";
import { upcomingMonday } from "@/lib/contentPlan";
import { loadGoals } from "@/lib/goals";
import { links } from "@/lib/links";
import { loadMedia } from "@/lib/mediaLibrary";
import { isPositioningUsable, loadPositioning, type PlanPlatform } from "@/lib/positioning";
import { platformName } from "@/lib/socialConnect";
import { defaultWho, speakerOf, speakers } from "@/lib/talkingHead";
import { useUrlState, useUrlUpdate } from "@/lib/urlState";
import { useLeoUser } from "@/lib/useLeoOnly";
import NotFoundPage from "@/pages/NotFoundPage";

const HEAD = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const TITLE: Record<WizardStep, string> = { who: "Who it reaches", angles: "Angles", where: "Where it posts", pace: "Format and pace", review: "Review" };
const QUESTION: Partial<Record<WizardStep, string>> = {
  who: "Who should this campaign reach?",
  where: "Where does it go out?",
  pace: "What gets made, and how often?",
};

export default function CampaignWizardPage() {
  const leo = useLeoUser();
  if (leo === undefined) return <div className="mx-auto min-h-[40vh] max-w-[680px] animate-pulse rounded-xl bg-muted" aria-busy="true" />;
  if (!leo) return <NotFoundPage />;
  return <Wizard userId={leo.id} />;
}

/** Who speaks in an AI video: the brand's "Who appears", or a pick at Make when it is Ask each time. */
function whoLine(userId: string): string {
  const s = speakers(userId);
  const sp = speakerOf(s, defaultWho(s));
  return !sp ? "You pick who appears at Make." : sp.person === "mine" ? "Who appears: you, with your saved face." : `Who appears: ${sp.p.name}.`;
}

function Wizard({ userId }: { userId: string }) {
  const [today] = useState(() => new Date());
  const start = useMemo(() => upcomingMonday(today), [today]);
  const positioning = loadPositioning(userId);
  const [audiences, setAudiences] = useState(() => loadAudiences(userId));
  useEffect(() => onAudiencesChanged(() => setAudiences(loadAudiences(userId))), [userId]);
  const [stored, setStored] = useState<WizardWork>(() => loadWizard(userId) ?? newWork(positioning?.platform ?? "linkedin"));
  const accounts = useAccounts(userId);
  const [urlStep, setUrlStep] = useUrlState<WizardStep | "">("step", "", { allowed: STEPS });
  const [params] = useSearchParams();
  const setUrl = useUrlUpdate();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Campaign | null>(null);
  const usesLeft = useUsesLeft(adding);
  const hasMedia = useMemo(() => loadMedia(userId).length > 0, [userId]);
  const who = useMemo(() => whoLine(userId), [userId]);

  const save = (next: WizardWork) => {
    setStored(next);
    saveWizard(userId, next);
  };

  // ?audience=<id> answers step 1 once, then leaves the address (the wizard keeps it)
  useEffect(() => {
    const id = params.get("audience");
    if (!id) return;
    if (audiences.some((a) => a.id === id)) save(withAudience(stored, id));
    setUrl({ audience: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const audience = audiences.find((a) => a.id === stored.audience) ?? null;
  // an audience removed since step 1 opens step 1 again
  const work = stored.audience && !audience ? withoutAudience(stored) : stored;
  const open = openStep(urlStep || null, work);
  const picked = work.audience ?? audiences[0]?.id ?? null;

  const accountsOn = accounts.state === "ready" && accounts.accounts.length > 0;
  const accountList = accounts.state === "ready" ? accounts.accounts : [];
  const accountIds = accountsOn ? (work.accountIds ?? defaultAccounts(accountList)).filter((id) => accountList.some((a) => a.id === id)) : [];
  const platforms: PlanPlatform[] = accountsOn
    ? [...new Set(accountIds.map((id) => accountList.find((a) => a.id === id)?.platform as PlanPlatform))]
    : work.platforms;
  const whereNames = platforms.map(platformName);
  const whereValue = accountsOn
    ? accountIds.map((id) => `@${accountList.find((a) => a.id === id)?.username.replace(/^@/, "")}`).join(", ")
    : whereNames.join(", ");
  const perWeek = work.perWeek ?? nearestPace(loadGoals(userId)[platforms[0]]);
  const pictures = hasMedia && work.formats.includes("slideshow") ? work.pictures : "stock";
  const posts = work.weeks * perWeek;
  const name = work.name ?? (audience ? defaultName(audience.name, start) : "");
  const left = { video: videosLeft(usesLeft("ai-video"), usesLeft("ai-voice")), remix: usesLeft("remix-make") };
  const cost = campaignCost({ posts: previewPosts(work.formats, perWeek, work.weeks) }, left);
  const formatsValue = work.formats.map((f) => FORMAT_NAME[f]).join(", ");
  const full = loadCampaigns(userId).length >= MAX_CAMPAIGNS;

  /** After a Confirm the first unfinished step opens; Change and Back name theirs. */
  const goTo = (step: WizardStep | "") => setUrlStep(step);
  const confirm = (next: WizardWork) => {
    save(next);
    goTo("");
  };

  const add = () => {
    if (!audience) return;
    setAdding(true);
    setError(null);
    const ask: CampaignAsk = {
      audience: audience.id, angles: work.angles, platforms, ...(accountsOn ? { accountIds } : {}), formats: work.formats, weeks: work.weeks, perWeek,
      pictures, name: name.trim() || defaultName(audience.name, start),
    };
    // a painted frame of "Adding..." before the save, which is quick and local
    requestAnimationFrame(() =>
      window.setTimeout(() => {
        let c: Campaign;
        let line: string | null;
        try {
          c = planCampaign(userId, ask, today);
          line = addCampaign(userId, c);
        } catch {
          line = "Couldn't add the campaign. Try again.";
        }
        setAdding(false);
        if (line) return setError(line);
        saveWizard(userId, null);
        startDrafting(userId, c.id);
        setAdded(c);
        goTo("");
      }, 0),
    );
  };

  const startOver = () => {
    if (!window.confirm("Clear this campaign plan?")) return;
    if (work.audience) saveWork(userId, work.audience, null);
    save(newWork(positioning?.platform ?? "linkedin"));
    saveWizard(userId, null);
    goTo("");
  };

  const collapsed = (step: WizardStep, value: ReactNode) => (
    <div key={step} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
      {/* the label above the value on a phone, beside it from sm up */}
      <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-3">
        <span className={`${HEAD} block shrink-0`}>{STEP_LABEL[step]}</span>
        <span className="mt-0.5 block break-words text-sm sm:mt-0">{value}</span>
      </div>
      <Button variant="ghost" size="sm" disabled={adding} onClick={() => goTo(step)}>
        Change
      </Button>
    </div>
  );
  const later = (step: WizardStep) => (
    <div key={step} className="rounded-xl border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground/70" aria-disabled="true">
      {STEP_LABEL[step]}
    </div>
  );
  const footer = (step: WizardStep, reason: string | null, onConfirm: () => void) => (
    <div className="space-y-1 border-t border-border/60 pt-4">
      <div className="flex items-center justify-between gap-2">
        {STEPS.indexOf(step) > 0 ? <Button variant="outline" onClick={() => goTo(STEPS[STEPS.indexOf(step) - 1])}>Back</Button> : <span />}
        <Button onClick={onConfirm} disabled={!!reason}>Confirm</Button>
      </div>
      {reason && <p className="text-right text-xs text-muted-foreground">{reason}</p>}
    </div>
  );
  const card = (step: WizardStep, body: ReactNode, foot: ReactNode) => (
    <section key={step} aria-labelledby="wizard-q" className="space-y-4 rounded-xl border border-border/60 bg-card p-4 shadow-card sm:p-5">
      <header className="space-y-1">
        {QUESTION[step] ? (
          <>
            <p className={HEAD}>{TITLE[step]} | {STEPS.indexOf(step) + 1} of 5</p>
            <h2 id="wizard-q" className="font-serif text-xl sm:text-2xl">{QUESTION[step]}</h2>
          </>
        ) : (
          <h2 id="wizard-q" className={HEAD}>{TITLE[step]} | {STEPS.indexOf(step) + 1} of 5</h2>
        )}
      </header>
      {body}
      {foot}
    </section>
  );

  const openCard = (step: WizardStep): ReactNode => {
    if (step === "who") {
      if (!audiences.length) return card(step, <NoAudience positioningUsable={isPositioningUsable(positioning)} />, null);
      return card(
        step,
        <WhoStep audiences={audiences} picked={picked} onPick={(id) => save(pickAudience(work, id))} />,
        footer(step, picked ? null : "Pick who it reaches.", () => picked && confirm(withAudience(work, picked))),
      );
    }
    if (step === "angles" && audience) {
      return (
        <div key={step} className="space-y-4 rounded-xl border border-border/60 bg-card p-4 shadow-card sm:p-5">
          <AnglesStep
            audience={audience}
            value={work.angles}
            onChange={() => goTo("angles")}
            onConfirm={(angles) => confirm(confirmed({ ...work, angles, fresh: freshAngles(angles, anglesFor(userId, audience.id), work.fresh) }, "angles"))}
          />
        </div>
      );
    }
    if (step === "where") {
      const count = accountsOn ? accountIds.length : platforms.length;
      return card(
        step,
        <WhereStep accounts={accounts} picked={accountIds} onAccounts={(ids) => save({ ...work, accountIds: ids })} platforms={work.platforms}
          onPlatforms={(p) => save({ ...work, platforms: p })} />,
        footer(step, accounts.state === "loading" ? "Loading your accounts..." : whereLine(count), () => confirm({ ...confirmed(work, "where"), ...(accountsOn ? { accountIds } : {}) })),
      );
    }
    if (step === "pace") {
      return card(
        step,
        <PaceStep formats={work.formats} onFormats={(formats) => save({ ...work, formats })} weeks={work.weeks} onWeeks={(weeks) => save({ ...work, weeks })}
          perWeek={perWeek} onPerWeek={(n) => save({ ...work, perWeek: n })} pictures={hasMedia ? work.pictures : "stock"} onPictures={(p) => save({ ...work, pictures: p })}
          hasMedia={hasMedia} who={who} summary={summaryLines(posts, work.weeks, whereNames, cost)} />,
        footer(step, formatLine(work.formats), () => confirm(confirmed({ ...work, perWeek }, "pace"))),
      );
    }
    if (step === "review" && audience) {
      const uses = Math.ceil(posts / 7);
      return card(
        step,
        <ReviewStep
          name={name}
          onName={(n) => save({ ...work, name: n })}
          rows={[
            ["Who", audience.name],
            ["Angles", work.angles.map((a) => `${a.title}${work.fresh.includes(a.id) ? " (new)" : ""}`).join(", ")],
            ["Where", accountsOn ? whereValue : listJoin(whereNames)],
            ["Formats", formatsValue],
            ["Pace", `${paceLabel(perWeek)} | ${work.weeks} ${work.weeks === 1 ? "week" : "weeks"} | starts ${shortDay(start)}`],
          ]}
          goal={positioning?.goal?.trim() ?? ""}
          success={successLine({ posts, winners: winnersFor(posts) })}
          cost={costLine(cost)}
          adding={adding}
          left={usesLeft("campaign-draft")}
          uses={uses}
          limitLine={writeLimitLine(posts, usesLeft("campaign-draft"))}
          blocked={full ? LIMIT_LINE : null}
          error={error}
          onBack={() => goTo("pace")}
          onAdd={add}
        />,
        null,
      );
    }
    return null;
  };

  const value: Partial<Record<WizardStep, ReactNode>> = {
    who: audience?.name,
    where: whereValue,
    pace: `${formatsValue} | ${paceLabel(perWeek)} | ${work.weeks} ${work.weeks === 1 ? "week" : "weeks"}`,
  };

  return (
    <div className="mx-auto max-w-[680px] space-y-3 pb-10">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
        <Link to={links.campaigns()} className="inline-flex min-h-11 items-center hover:text-foreground">Campaigns</Link>
        {audience && (
          <>
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0" />
            <span className="truncate">{audience.name}</span>
          </>
        )}
      </nav>
      <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Plan a campaign</h1>

      {added ? (
        <AddedCard id={added.id} name={added.name} line={addedLine(added, added.platforms.map(platformName))} cost={costLine(campaignCost(added, left))} />
      ) : (
        <>
          {STEPS.map((step) => {
            if (step === open) return openCard(step);
            if (!work.done.includes(step)) return later(step);
            if (step === "angles" && audience) {
              return <AnglesStep key={step} audience={audience} value={work.angles} collapsed onConfirm={() => {}} onChange={() => !adding && goTo("angles")} />;
            }
            return collapsed(step, value[step]);
          })}
          {(work.audience || work.done.length > 0) && (
            <div className="pt-2 text-center">
              <Button variant="link" className="text-muted-foreground" disabled={adding} onClick={startOver}>Start over</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
