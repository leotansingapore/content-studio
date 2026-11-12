import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useDraftReviews } from "@/hooks/useDraftReviews";
import { supabase } from "@/lib/supabase";
import {
  loadDrafts,
  getDraftStats,
  getPostingActivity,
  draftStatus,
  setDraftStatus,
  undoPosted,
  type DraftEntry,
  type DraftStats,
  type PostingActivity,
  onDraftsChanged,
} from "@/lib/draftHistory";
import { GOAL_PLATFORMS, MAX_WEEKLY_GOAL, loadGoals, saveGoals, sgDay, weekProgress, type WeeklyGoals } from "@/lib/goals";
import { localDateKey } from "@/lib/dueDates";
import { loadCoachHistory } from "@/lib/coach";
import { loadVoiceProfile, isVoiceProfileUsable } from "@/lib/voiceProfile";
import { isOnboarded } from "@/lib/onboarding";
import { loadResult, nextAction, type NextAction } from "@/lib/diagnosis";
import { PencilSimpleIcon, LightbulbIcon, UsersIcon, CheckCircleIcon, ClockIcon, FileTextIcon, SparkleIcon, FireIcon, MinusIcon, PlusIcon, TrayIcon, EyeIcon, HeartIcon, ChatCircleIcon, ShareNetworkIcon } from "@phosphor-icons/react";
import { loadBrand } from "@/lib/carousel";
import { adviserBrand } from "@/lib/profession";
import { checkMe, sharedBoard, waitsOnMe, type Board, type Me } from "@/lib/reelsBoard";
import { campaignsToReview, heldOrLive, type NextUpItem, type PlanCounts } from "@/lib/needsYou";
import HomeWriter from "@/components/home/HomeWriter";
import NextUp from "@/components/home/NextUp";
import { useLeoUser } from "@/lib/useLeoOnly";
import { marketShown } from "@/lib/market";
import { activeProfile, activeProfileId } from "@/lib/profiles";
import WhatMovedCard from "@/components/WhatMovedCard";
import PaceCard from "@/components/home/PaceCard";
import GoalLine from "@/components/GoalLine";
import type { Campaign } from "@/lib/campaigns";
import { lastPull, onNumbers, postsInDays, pullBrand, realNumbersOn, realTotals, type Pulled } from "@/lib/realNumbers";
import { socialConnectShown } from "@/lib/socialConnect";
import { browserTimeZone } from "@/lib/autoPost";
import { STATUS_LABEL as CAMPAIGN_STATUS } from "@/lib/campaignLabels";
import { nextRunAt, sanitizeSchedule } from "../../supabase/functions/_shared/slideCampaign.ts";

// Leo's Home (agent-home): its own chunk, so the agent engine never loads for anyone else.
const AgentHome = lazy(() => import("@/components/home/AgentHome"));
// Recent creations, formats, ads and Publish and promote load after Home paints; a chunk gone after a deploy draws none
const HomeRows = lazy(() => import("@/components/home/HomeRows").catch(() => ({ default: () => null })));

const PLATFORM_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

export interface CampaignTime {
  id: string;
  name: string;
  at: Date;
}

/** Coming up's campaign rows: each live campaign's next posting time after `now` in its own zone, soonest first, at most `n`. */
export function campaignTimes(rows: { id: string; name: string; status: string; schedule: unknown }[], now: Date, n = 3): CampaignTime[] {
  return rows
    .flatMap((r) => {
      const at = r.status === "live" ? nextRunAt(sanitizeSchedule(r.schedule), now) : null;
      return at ? [{ id: r.id, name: r.name, at }] : [];
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, n);
}

/**
 * A customer's Next up (12 Nov, Fastlane's Home): needsYouItems' list plus the page's own, in its order. The newest
 * unfinished post comes before the plans and setup (Home's one filled button when nothing more urgent waits), unless a
 * made post already leads that group; then the adviser diagnosis's next move and the next "Get set up" step.
 */
export function customerItems(
  items: NextUpItem[],
  o: { drafts: DraftEntry[]; setup: { label: string; to: string; line: string } | null; nextAct: NextAction | null },
): NextUpItem[] {
  const out = [...items];
  const open = o.drafts.find((d) => draftStatus(d) === "draft" && !heldOrLive(d));
  if (open && !out.some((i) => i.kind === "unscheduled")) {
    const at = out.findIndex((i) => LATER.has(i.kind));
    const quote = open.hook?.trim() || open.draft.split("\n")[0]?.trim() || undefined;
    out.splice(at < 0 ? out.length : at, 0, { id: `finish:${open.id}`, kind: "unscheduled", title: "Finish your post", quote, actions: [{ label: "Open", to: `/generate?draft=${encodeURIComponent(open.id)}` }] });
  }
  const act = o.nextAct;
  if (act?.kind === "mission" && act.mission)
    out.push({ id: "mission", kind: "setup", title: `Mission: ${act.mission.title}`, line: act.mission.objective, actions: [{ label: "Start mission", to: act.mission.to }] });
  if (act?.kind === "diagnose") out.push({ id: "diagnose", kind: "setup", title: "Get your Content Score", line: act.detail, actions: [{ label: "Start", to: "/coach" }] });
  if (o.setup) out.push({ id: "setup", kind: "setup", title: o.setup.label, line: o.setup.line, actions: [{ label: "Open", to: o.setup.to }] });
  return out;
}
const LATER = new Set<NextUpItem["kind"]>(["autopilot", "campaign", "ideas", "social", "market", "setup"]);

/** The heading's brand: the brand kit's name, else the profile's unless it is the default "Me". */
const brandName = (uid: string | null) => {
  if (!uid) return "";
  const kit = loadBrand(uid)?.name?.trim();
  const profile = activeProfile(uid).name.trim();
  return kit || (profile && profile !== "Me" ? profile : "");
};

function StatCard({
  icon: Icon,
  value,
  label,
  tint,
}: {
  icon: typeof FileTextIcon;
  value: number;
  label: string;
  tint: string;
}) {
  return (
    <Card className="border-border/60 shadow-card">
      <CardContent className="flex items-center gap-3 py-4">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="font-serif text-2xl font-semibold leading-none text-foreground">
            {value.toLocaleString()}
          </div>
          <div className="mt-1 text-xs leading-tight text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

/** The greeting's name: the email's prefix when it is 2 to 18 letters. */
export default function HomePage() {
  // Leo's sign-in is known from the stored session on the first frame, so his Home reads the device at once (uid)
  // rather than after the Auth round trip; everyone else starts empty, as before.
  const leo = useLeoUser();
  const [userId, setUserId] = useState<string | null>(null);
  const uid = userId ?? leo?.id ?? null;
  const [drafts, setDrafts] = useState<DraftEntry[]>(() => (leo ? loadDrafts(leo.id) : []));
  // The assistant moves posts from outside this page: read them again when it does.
  useEffect(() => (uid ? onDraftsChanged(() => setDrafts(loadDrafts(uid))) : undefined), [uid]);
  // Team rule: members on approval can't mark a post posted until it is approved.
  const reviews = useDraftReviews(uid, drafts);
  const [voiceReady, setVoiceReady] = useState<boolean>(() => (leo ? isVoiceProfileUsable(loadVoiceProfile(leo.id)) : true));
  const [coachRuns, setCoachRuns] = useState<number>(() => (leo ? loadCoachHistory(leo.id).length : 0));
  const [goals, setGoals] = useState<WeeklyGoals>(() => (leo ? loadGoals(leo.id) : {}));
  // Goal being edited on the This week card (null = not editing).
  const [goalDraft, setGoalDraft] = useState<WeeklyGoals | null>(null);
  const [nextAct, setNextAct] = useState<NextAction | null>(null);
  const [contentScore, setContentScore] = useState<number | null>(null);
  // Posts board users: who they are on the team and the board (null when it didn't answer).
  const [day, setDay] = useState<{ me: Me; board: Board | null } | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Leo's plans (north star phase 5): what his Next up counts, and the Today's ideas tile, read from the open brand's
  // device stores again whenever autopilot, a campaign or the ideas change. Their modules load for Leo only.
  const leoId = leo?.id;
  const [plan, setPlan] = useState<(PlanCounts & { list: Campaign[] }) | null>(null);
  useEffect(() => {
    if (!leoId) return;
    let active = true;
    const offs: (() => void)[] = [];
    void Promise.all([import("@/lib/autopilot"), import("@/lib/autopilotJob"), import("@/lib/campaigns"), import("@/lib/ideasInbox")]).then(
      ([ap, job, cm, ideas]) => {
        if (!active) return;
        const read = () => {
          const day = sgDay();
          const list = cm.loadCampaigns(leoId);
          setPlan({
            autopilot: ap.autopilotWaiting(leoId, day),
            campaigns: campaignsToReview(list),
            list,
            ideas: ideas.newIdeasCount(leoId, day),
          });
        };
        read();
        offs.push(job.onAutopilot(read), cm.onCampaignsChanged(read), ideas.onIdeasChanged(read));
      },
      () => {}, // a chunk gone after a deploy: Home shows no plan rows until the next load
    );
    return () => {
      active = false;
      offs.forEach((off) => off());
    };
  }, [leoId]);

  useEffect(() => {
    document.title = "Home - Postmosis";
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      const id = data.user?.id ?? null;
      // First-run: brand-new users get the welcome walkthrough once.
      const firstRun =
        loadDrafts(id).length === 0 &&
        !isVoiceProfileUsable(loadVoiceProfile(id)) &&
        !isOnboarded(id);
      if (firstRun) {
        navigate("/welcome", { replace: true });
        return;
      }
      setUserId(id);
      setDrafts(loadDrafts(id));
      setVoiceReady(isVoiceProfileUsable(loadVoiceProfile(id)));
      setCoachRuns(loadCoachHistory(id).length);
      setGoals(loadGoals(id));
      const diag = loadResult(id);
      setContentScore(diag?.overall ?? null);
      // the diagnosis is an adviser brand's (MAS and AIA questions): another brand's Home has no next move from it
      setNextAct(adviserBrand(id) ? nextAction(diag) : null);
      // After the first-run check. checkMe shares the shell's call on a first sign-in, so Today shows then too;
      // the board call is the one the shell already made for its count.
      const me = await checkMe().catch(() => null);
      if (!me || !waitsOnMe(me)) return;
      const board = await sharedBoard().catch(() => null);
      if (active) setDay({ me, board });
    })();
    return () => {
      active = false;
    };
  }, []);

  // Unfinished drafts first: scheduled posts already show in the due card and Coming up.
  // Recounted from the saved posts whenever they change, so Mark posted here moves the numbers too.
  const stats = useMemo<DraftStats | null>(() => (userId ? getDraftStats(userId) : null), [userId, drafts]);
  const activity = useMemo<PostingActivity>(() => getPostingActivity(userId), [userId, drafts]);

  const hasPosts = drafts.length > 0;

  // Publish and promote's Campaigns card: the open brand's slideshow campaigns and the live ones' next posting times
  // (owner-only select, as on /design/campaigns). Campaigns need posting on, so nobody else is asked.
  const [campaigns, setCampaigns] = useState<CampaignTime[]>([]);
  // the Campaigns card: the brand's three most recently changed campaigns, any status (Volume's home lists them)
  const [recentCampaigns, setRecentCampaigns] = useState<{ id: string; name: string; status: keyof typeof CAMPAIGN_STATUS; schedule: unknown }[]>([]);
  useEffect(() => {
    if (!uid || !socialConnectShown()) return;
    let active = true;
    void supabase
      .from("cs_slide_campaigns")
      .select("id, name, status, schedule")
      .eq("profile_id", activeProfileId(uid))
      .order("updated_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (!active || error) return;
        const rows = (data ?? []) as { id: string; name: string; status: keyof typeof CAMPAIGN_STATUS; schedule: unknown }[];
        setCampaigns(campaignTimes(rows.filter((r) => r.status === "live"), new Date()));
        setRecentCampaigns(rows.slice(0, 3));
      });
    return () => {
      active = false;
    };
  }, [uid]);
  const homeCampaigns = useMemo(
    () => recentCampaigns.map((c) => ({ id: c.id, name: c.name, status: CAMPAIGN_STATUS[c.status] ?? c.status, next: campaigns.find((t) => t.id === c.id)?.at })),
    [recentCampaigns, campaigns],
  );
  // how many things Next up lists: none, and Write it is the page's one filled button
  const [waiting, setWaiting] = useState<number | null>(null);

  // Last 30 days (Volume's Home): Your real numbers' last pull on this page load, else one pull, for sign-ins that use them
  const [pulled, setPulled] = useState<Pulled | null>(null);
  useEffect(() => {
    if (!uid || !socialConnectShown() || !realNumbersOn(uid)) return;
    let active = true;
    const read = () => active && setPulled(lastPull(uid));
    read();
    // a failed pull shows no strip, as with no numbers
    if (!lastPull(uid)) pullBrand(uid).then(read, () => {});
    const off = onNumbers(read);
    return () => {
      active = false;
      off();
    };
  }, [uid]);
  const last30 = useMemo(() => (pulled ? realTotals(postsInDays(pulled.posts, 30, browserTimeZone())) : null), [pulled]);

  const week = useMemo(() => weekProgress(drafts, goals), [drafts, goals]);
  const goalHit = week.goal > 0 && week.rows.every((r) => r.posted >= r.goal);
  const saveGoal = () => {
    if (!userId || !goalDraft) return;
    setGoals(saveGoals(userId, goalDraft));
    setGoalDraft(null);
  };

  const markDuePosted = (id: string) => {
    const prev = drafts.find((d) => d.id === id);
    if (!uid || !prev) return;
    const blocked = reviews.blockReason(prev);
    if (blocked) {
      toast({ title: "Approval needed before posting", description: `Team rule. ${blocked}` });
      return;
    }
    const before = drafts;
    setDrafts(setDraftStatus(uid, id, "posted"));
    toast({
      title: "Marked as posted",
      action: (
        <ToastAction altText="Undo" onClick={() => setDrafts(undoPosted(uid, prev, before))}>
          Undo
        </ToastAction>
      ),
    });
  };

  const kit = loadBrand(uid);
  const checklist = [
    { done: voiceReady, label: "Set your voice", to: "/voice" },
    // the brand kit puts your photo, name and sign-off on every carousel, video and copied post
    { done: !!kit && !!(kit.photo || kit.signOff?.trim()), label: "Set up your brand kit", to: "/brand" },
    { done: hasPosts, label: "Write your first post", to: "/generate" },
    // a post that went out was scheduled or posted first, so the step stays done once it leaves the calendar
    { done: (stats?.scheduled ?? 0) > 0 || (stats?.posted ?? 0) > 0, label: "Schedule a post", to: "/calendar" },
    { done: coachRuns > 0, label: "Check your content in Coach", to: "/coach" },
  ];
  const checklistDone = checklist.filter((c) => c.done).length;
  const step = checklist.find((c) => !c.done);
  const firstSetup = step ? { label: step.label, to: step.to, line: `${checklistDone} of ${checklist.length} set up` } : null;
  const brand = brandName(uid);
  const header = (
    <header className="mx-auto w-full max-w-3xl space-y-2 text-center">
      <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
        {leoId ? "What should the agent make" : "What do you want to make"}
        {brand ? ` for ${brand}` : ""}?
      </h1>
      <div className="flex justify-center text-left">
        <GoalLine />
      </div>
    </header>
  );

  return (
    <div className="space-y-8">
      {leoId ? (
        // the heading paints at once; the composer, Next up and the rows follow with the chunk
        <Suspense
          fallback={
            <>
              {header}
              {/* the composer's and Next up's room, so the page below doesn't jump when they arrive */}
              <div className="mx-auto h-28 w-full max-w-3xl animate-pulse rounded-2xl border border-border/60 bg-card" aria-busy="true" aria-label="Loading" />
              <div className="h-48 animate-pulse rounded-2xl border border-border/60 bg-card" />
            </>
          }
        >
          <AgentHome
            userId={leoId}
            greeting={header}
            drafts={drafts}
            day={day}
            plan={plan}
            market={marketShown()}
            setup={checklist.find((c) => !c.done) ?? null}
            campaigns={homeCampaigns}
            markPosted={markDuePosted}
            blocked={(id) => {
              const d = drafts.find((x) => x.id === id);
              return d ? reviews.blockReason(d) : null;
            }}
          />
        </Suspense>
      ) : (
        <>
          {/* Fastlane's Home, 11 Nov: the question, the composer (our writer), Next up, then the rows */}
          {header}
          <HomeWriter userId={uid} primary={waiting === 0} className="mx-auto w-full max-w-3xl" />
          {uid && (
            <NextUp
              userId={uid}
              today={localDateKey()}
              usage={null}
              markPosted={markDuePosted}
              blocked={(id) => {
                const d = drafts.find((x) => x.id === id);
                return d ? reviews.blockReason(d) : null;
              }}
              input={{ drafts, me: day?.me ?? null, board: day?.board ?? null }}
              shape={(items) => customerItems(items, { drafts, setup: firstSetup, nextAct })}
              onCount={setWaiting}
              empty="Nothing needs you right now. Write something new above."
            />
          )}
          {uid && (
            <Suspense fallback={null}>
              <HomeRows userId={uid} drafts={drafts} campaigns={homeCampaigns} />
            </Suspense>
          )}
        </>
      )}

      {/* Below Fastlane's five blocks: our own numbers, which Fastlane keeps on Analytics */}

      {/* What moved this week (Leo only; /home#what-moved) */}
      {userId && <WhatMovedCard userId={userId} />}

      {/* Last 30 days of real numbers; none at all shows nothing rather than zeros */}
      {last30 && last30.views + last30.likes + last30.comments + last30.shares > 0 && (
        <section aria-labelledby="home-last-30" className="space-y-3">
          <h2 id="home-last-30" className="font-serif text-lg font-semibold text-foreground">
            Last 30 days
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={EyeIcon} value={last30.views} label="Views" tint="bg-primary/10 text-primary" />
            <StatCard icon={HeartIcon} value={last30.likes} label="Likes" tint="bg-brand/10 text-brand" />
            <StatCard icon={ChatCircleIcon} value={last30.comments} label="Comments" tint="bg-success/10 text-success" />
            <StatCard icon={ShareNetworkIcon} value={last30.shares} label="Shares" tint="bg-accent text-foreground" />
          </div>
        </section>
      )}

      {/* Post tracking stats */}
      {stats && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={CheckCircleIcon}
            value={stats.postedThisMonth}
            label="Posted this month"
            tint="bg-success/10 text-success"
          />
          <StatCard
            icon={ClockIcon}
            value={stats.scheduled}
            label="Scheduled"
            tint="bg-primary/10 text-primary"
          />
          <StatCard
            icon={FileTextIcon}
            value={stats.drafts}
            label="Drafts in progress"
            tint="bg-brand/10 text-brand"
          />
          <StatCard
            icon={SparkleIcon}
            value={stats.posted}
            label="Posted all-time"
            tint="bg-accent text-foreground"
          />
        </section>
      )}

      {/* Weekly rhythm: consistency vs goal + streak */}
      {(hasPosts || week.goal > 0) && (
        <section className={`grid gap-3 ${leoId ? "items-start sm:grid-cols-[2fr_1fr]" : "sm:grid-cols-2"}`}>
          {/* Leo's Pace (learn-pace, /home#pace) where This week is; the goal editor still takes its place */}
          {leoId && !goalDraft ? (
            <PaceCard userId={leoId} week={week} goalHit={goalHit} onEditGoal={() => setGoalDraft(goals)} />
          ) : (
          <Card className="border-border/60 shadow-card">
            {goalDraft ? (
              <CardContent className="space-y-2 py-4">
                <p className="text-sm font-semibold text-foreground">Posts per week</p>
                {GOAL_PLATFORMS.map((p) => {
                  const n = goalDraft[p] ?? 0;
                  const set = (v: number) => setGoalDraft({ ...goalDraft, [p]: Math.max(0, Math.min(MAX_WEEKLY_GOAL, v)) });
                  return (
                    <div key={p} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-foreground">{PLATFORM_LABEL[p]}</span>
                      <span className="flex items-center gap-1">
                        <Button type="button" variant="outline" size="icon" className="h-9 w-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" onClick={() => set(n - 1)} disabled={n <= 0} aria-label={`Fewer ${PLATFORM_LABEL[p]} posts`}>
                          <MinusIcon className="h-3.5 w-3.5" />
                        </Button>
                        <span className={`w-8 text-center font-semibold tabular-nums ${n ? "text-foreground" : "text-muted-foreground"}`} aria-live="polite">
                          {n}
                        </span>
                        <Button type="button" variant="outline" size="icon" className="h-9 w-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" onClick={() => set(n + 1)} disabled={n >= MAX_WEEKLY_GOAL} aria-label={`More ${PLATFORM_LABEL[p]} posts`}>
                          <PlusIcon className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    </div>
                  );
                })}
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" className="[@media(pointer:coarse)]:h-11" onClick={() => setGoalDraft(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" className="[@media(pointer:coarse)]:h-11" onClick={saveGoal}>
                    Save goal
                  </Button>
                </div>
              </CardContent>
            ) : (
              <CardContent className="space-y-2 py-4">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-semibold text-foreground">This week</span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    {/* toward the goal, as the bar and "to do" count; with no goal, every post */}
                    {week.goal > 0 ? week.met : week.posted}
                    {week.goal > 0 ? ` / ${week.goal}` : ""} posted
                    {week.goal > 0 && (
                      <Button variant="ghost" size="icon" className="-my-2 -mr-2 h-9 w-9 [@media(pointer:coarse)]:-my-3 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" onClick={() => setGoalDraft(goals)} aria-label="Edit weekly goal">
                        <PencilSimpleIcon className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </span>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-gradient-primary transition-all duration-500"
                    style={{ width: `${week.goal > 0 ? (week.met / week.goal) * 100 : week.posted > 0 ? 100 : 0}%` }}
                  />
                  {week.goal > 0 && (
                    <div
                      className="h-full bg-primary/30 transition-all duration-500"
                      style={{ width: `${((week.goal - week.toDo - week.met) / week.goal) * 100}%` }}
                    />
                  )}
                </div>
                {week.rows.length > 0 && week.goal > 0 && (
                  <ul className="space-y-1 pt-0.5">
                    {week.rows.map((r) => (
                      <li key={r.platform} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-foreground">{PLATFORM_LABEL[r.platform]}</span>
                        <span className="text-right tabular-nums text-muted-foreground">
                          {r.posted} posted, {r.scheduled} scheduled
                          {r.goal > 0 &&
                            (r.toDo > 0 ? (
                              <>
                                {", "}
                                <span className="font-semibold text-foreground">{r.toDo} to do</span>
                              </>
                            ) : r.posted >= r.goal ? (
                              <span className="font-semibold text-success">, done</span>
                            ) : (
                              ", all planned"
                            ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {goalHit ? (
                  <p className="text-xs text-muted-foreground">Goal hit for the week.</p>
                ) : (
                  week.goal === 0 && (
                    <Button variant="link" size="sm" className="h-9 px-0 text-xs [@media(pointer:coarse)]:h-11" onClick={() => setGoalDraft(goals)}>
                      Set a weekly goal
                    </Button>
                  )
                )}
              </CardContent>
            )}
          </Card>
          )}
          <Card className="border-border/60 shadow-card">
            <CardContent className="flex items-center gap-3 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
                <FireIcon className="h-5 w-5" />
              </span>
              <div>
                <div className="font-serif text-2xl font-semibold leading-none text-foreground">
                  {activity.weekStreak}{" "}
                  <span className="text-base font-normal text-muted-foreground">
                    {activity.weekStreak === 1 ? "week" : "weeks"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {activity.weekStreak > 0
                    ? "Posting streak"
                    : "Post once this week to start a streak."}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Discover: Inspiration and Creators are Singapore personal-finance libraries, for an adviser's brand only */}
      {(adviserBrand(uid) || plan) && <section className="space-y-3">
        <h2 className="font-serif text-lg font-semibold text-foreground">
          Need an idea?
        </h2>
        <div className={`grid gap-3 ${plan ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"}`}>
          {adviserBrand(uid) && <>
          <Link
            to="/inspiration"
            className="group flex items-start gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-card transition-colors hover:border-primary/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <LightbulbIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Browse inspiration
              </p>
              <p className="text-xs text-muted-foreground">
                100 real posts that worked. Steal the pattern, make it yours.
              </p>
            </div>
          </Link>
          <Link
            to="/profiles"
            className="group flex items-start gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-card transition-colors hover:border-primary/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UsersIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Follow creators
              </p>
              <p className="text-xs text-muted-foreground">
                SG finance creators worth studying for angles and formats.
              </p>
            </div>
          </Link>
          </>}
          {plan && (
            <Link
              to="/ideas"
              className="group flex items-start gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-card transition-colors hover:border-primary/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
                <TrayIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Today's ideas</p>
                {/* the count lives in Next up */}
                <p className="text-xs text-muted-foreground">A fresh set each day, written for you.</p>
              </div>
            </Link>
          )}
        </div>
      </section>}
    </div>
  );
}
