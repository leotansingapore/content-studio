import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import SectionTabs, { PIPELINE_TABS } from "@/components/SectionTabs";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import DayInput from "@/components/DayInput";
import { ToastAction } from "@/components/ui/toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useDraftReviews } from "@/hooks/useDraftReviews";
import PostPreview from "@/components/PostPreview";
import { PostItForMePanel, ZernioChipLabel, ZernioStatus, useZernioRefresh } from "@/components/PostItForMe";
import { socialConnectShown } from "@/lib/socialConnect";
import { supabase } from "@/lib/supabase";
import { brandOf, checkMe, igHandle, isCarousel, loadConnectedIg, seesBoard, sharedBoard } from "@/lib/reelsBoard";
import { COVER_DAYS, dueByHand, runsOut, weekGlance, type DatedItem } from "@/lib/calendarCoverage";
import { openSlots, slotDaysLabel, slotsForGoal } from "@/lib/postingSlots";
import { DEFAULT_BRAND, loadBrand, saveBrand } from "@/lib/carousel";
import { loadGoals, saveGoals, setPlatformGoal, weekProgress } from "@/lib/goals";
import { getTrackedPosts, postingTimeOn, suggestPostingTime } from "@/lib/analytics";
import { loadPositioning } from "@/lib/positioning";
import { activeProfile, activeProfileId, loadProfiles, profileForBoardBrand } from "@/lib/profiles";
import { BusinessChips, useBusinessFilter } from "@/components/BusinessFilter";
import ChannelPostDrawer from "@/components/ChannelPostDrawer";
import CopyLinkButton from "@/components/CopyLinkButton";
import { links, slug } from "@/lib/links";
import { useGoneItem, useUrlItem, useUrlState, withParam } from "@/lib/urlState";
import { STATUS_LABEL, businessKey, canSeeChannelFeeds, fetchChannelFeeds, type CalendarFeedItem } from "@/lib/channelFeeds";
import {
  addDays,
  daysOverdue,
  dueHeading,
  keyToDate,
  localDateKey,
  monthGrid,
  overdueLabel,
  postedDay,
  scheduleAt,
  scheduleTime,
  timeLabel,
  weekOf,
} from "@/lib/dueDates";
import {
  draftsOfBrand,
  loadDrafts,
  setDraftStatus,
  duplicateDraft,
  undoDuplicate,
  MAX_DRAFTS,
  draftStatus,
  occurrencesBetween,
  restoreDraft,
  setRepeat,
  skipOccurrence,
  undoPosted,
  type DraftEntry,
  type RepeatEvery,
  onDraftsChanged,
} from "@/lib/draftHistory";
import {
  NOTE_COLORS,
  deleteNote,
  loadNotes,
  newNoteId,
  saveNote,
  type CalNote,
  type NoteColor,
} from "@/lib/calendarNotes";
import { sgDateLabel, sgDatesBetween, type SgDate } from "@/data/sgDates";
import { refreshCloudKeys } from "@/lib/cloudSync";
import {
  readTeamPosts,
  readTeamReviews,
  statusOf,
  teamPostsKey,
  teamReviewsKey,
  type TeamPost,
  type TeamReviews,
} from "@/lib/teamPosts";
import { TeamPostChip, TeamPostPanel } from "@/components/TeamPostReview";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  List,
  CheckCircle2,
  Clapperboard,
  Coins,
  Hand,
  PenLine,
  Repeat as RepeatIcon,
  StickyNote,
  X,
} from "lucide-react";

const PLATFORM_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  telegram: "Telegram",
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DRAG_TYPE = "text/draft-id";

const VIEWS = ["month", "week", "upcoming"] as const;
type View = (typeof VIEWS)[number];
type NoteForm = { id: string | null; date: string; title: string; color: NoteColor };

// Note colours are theme tokens, spelled out so Tailwind keeps the classes.
const NOTE_SWATCH: Record<NoteColor, string> = {
  brand: "bg-brand",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};
const NOTE_COLOR_NAME: Record<NoteColor, string> = {
  brand: "Purple",
  primary: "Blue",
  success: "Green",
  warning: "Amber",
  destructive: "Red",
};
const REPEAT_LABEL: Record<RepeatEvery, string> = {
  week: "weekly",
  "2weeks": "every 2 weeks",
  month: "monthly",
};
// Team posts' own entry in the business filter. Its slug "team-posts" is the ?business= value and the remembered pick,
// so it stays; the chip says where they go instead.
const TEAM_BUSINESS = "Team posts";
const bizName = (name: string) => (businessKey(name) === businessKey(TEAM_BUSINESS) ? "Telegram posts" : name);
const KEY_DATE_DAYS = 60; // how far ahead Upcoming lists holidays and money dates
const STATUSES = ["all", "scheduled", "posted"] as const;
type StatusFilter = (typeof STATUSES)[number];
const PLATFORMS = ["all", ...Object.keys(PLATFORM_LABEL)];

// A day key (YYYY-MM-DD) or month (YYYY-MM) from a link, or null when it isn't a real one.
const linkDay = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && localDateKey(keyToDate(v)) === v ? v : null);
const linkMonth = (v: string | null) => (v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null);

// The date a post "sits on" in the calendar: scheduled date, else the day it was
// posted (the same day Home's weekly count uses).
function eventDate(d: DraftEntry): string | null {
  const s = draftStatus(d);
  if (s === "scheduled" && d.scheduledFor) return d.scheduledFor.slice(0, 10);
  if (s === "posted" && d.postedAt) return postedDay(d.postedAt);
  return null;
}

// Orders a day's posts: no set time first, then by time.
const sortKey = (d: DraftEntry) =>
  (draftStatus(d) === "posted" ? d.postedAt : d.scheduledFor) ?? "";

const titleOf = (d: DraftEntry) => d.hook || d.draft.slice(0, 60) || "Untitled";
const dayLabel = (key: string) =>
  keyToDate(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const whenLabel = (scheduledFor: string) => {
  const time = scheduleTime(scheduledFor);
  return `${dayLabel(scheduledFor.slice(0, 10))}${time ? `, ${timeLabel(time)}` : ""}`;
};

const dateInputClass =
  "h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 [@media(pointer:coarse)]:h-11";

export default function CalendarPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const [userId, setUserId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  // Team rule: members on approval can't mark a post posted until it is approved.
  const reviews = useDraftReviews(userId, drafts);
  const [postOpenId, setPostOpenId] = useState<string | null>(null);
  // The post whose network preview is open in its panel.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  useZernioRefresh(userId, drafts, setDrafts);
  // The assistant moves posts from outside this page: read them again when it does.
  useEffect(() => (userId ? onDraftsChanged(() => setDrafts(loadDrafts(userId))) : undefined), [userId]);
  // Everything a link can name lives in the URL (docs/deep-links.md): view, filters, the month or week shown and
  // the open post, day, team post or channel post.
  const [view, setView] = useUrlState<View>("view", "month", { allowed: VIEWS, remember: "cs-calendar-view" });
  const [platform, setPlatform] = useUrlState("platform", "all", { allowed: PLATFORMS });
  const [status, setStatus] = useUrlState<StatusFilter>("status", "all", { allowed: STATUSES });
  const [selectedId, openPost, closePost] = useUrlItem("post");
  // deleted since the link was made; an empty list may still be syncing, so it decides nothing
  useGoneItem("post", drafts.length ? drafts.some((d) => d.id === selectedId) : undefined);
  // Set when the selected chip is a future occurrence of a recurring post (its day).
  const [selectedGhost, setSelectedGhost] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  // Day and optional time picked on an Unscheduled drafts row, until Schedule is tapped.
  const [rowPick, setRowPick] = useState<Record<string, { date: string; time: string }>>({});
  const editorRef = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState<CalNote[]>([]);
  // The note being added or edited; kept until saved or closed, so typed words survive a view change.
  const [noteForm, setNoteForm] = useState<NoteForm | null>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  // Reels scheduled on the reels board, for its owner: one calendar for everything that posts.
  // `auto`: the brand posts to Instagram by itself (igHandle: Meta, or connected in Content Studio); otherwise Leo posts it by hand.
  const [reels, setReels] = useState<
    { id: string; title: string; date: string; time: string | null; posted: boolean; business: string; auto: boolean; handle: string | null; href: string }[]
  >([]);
  // Every other brand's dated posts (docs/brand-isolation.md: the Calendar is the one page that shows all brands).
  // Read-only here; tapping one opens it in its own brand.
  const [otherBrands, setOtherBrands] = useState<typeof reels>([]);
  // Reels still in review or needing changes on the board: content waiting on Leo, with no date yet.
  const [waiting, setWaiting] = useState<{ id: string; title: string; business: string; brand: string; changes: boolean; carousel: boolean }[]>([]);
  // The day whose panel is open (tap a day number or an empty part of a day).
  const [dayParam, openDayParam, closeDay] = useUrlItem("day");
  const dayOpen = linkDay(dayParam);
  const [waitOpen, setWaitOpen] = useState(false);
  // Brand kit posting times ("<day 0 = Mon>T<HH:MM>"): open ones show on the calendar as slots to write for.
  const [slots, setSlots] = useState<string[]>([]);
  const [showSlots, setShowSlots] = useState(() => {
    try {
      return localStorage.getItem("cs-calendar-slots") !== "off";
    } catch {
      return true;
    }
  });
  const dayRef = useRef<HTMLDivElement>(null);
  // Channel posts other jobs publish (the MoneyBees Telegram channel first), with their full caption and pictures.
  const [feed, setFeed] = useState<CalendarFeedItem[]>([]);
  const [feedId, openFeedItem, closeFeed] = useUrlItem("feed");
  const openFeed = feed.find((f) => f.id === feedId) ?? null;
  const [profileName, setProfileName] = useState("");
  // Team posts Leo reviews before a job sends them to Telegram; empty for every other account.
  const [teamPosts, setTeamPosts] = useState<TeamPost[]>([]);
  const [teamReviews, setTeamReviews] = useState<TeamReviews>({});
  // /calendar?teampost=tp3 (the Telegram prompt links it): opens that post's review panel once it is loaded.
  const teamOpenId = params.get("teampost");

  useEffect(() => {
    document.title = "Calendar - Content Studio";
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      setDrafts(loadDrafts(id));
      setNotes(loadNotes(id));
      setProfileName(activeProfile(id).name);
      if (id) {
        const open = activeProfileId(id);
        setOtherBrands(
          loadProfiles(id)
            .filter((p) => p.id !== open)
            .flatMap((p) =>
              draftsOfBrand(id, p.id).flatMap((d) => {
                const date = eventDate(d);
                return date
                  ? [{ id: `${p.id}:${d.id}`, title: titleOf(d), date, time: scheduleTime(d.scheduledFor), posted: draftStatus(d) === "posted",
                      business: p.name, auto: false, handle: null, href: `/generate?draft=${encodeURIComponent(d.id)}&profile=${encodeURIComponent(p.id)}` }]
                  : [];
              }),
            ),
        );
      }
      setSlots(loadBrand(id)?.slots ?? []);
      setTeamPosts(readTeamPosts(id));
      setTeamReviews(readTeamReviews(id));
      // Leo, and team members with the posts board, see its posts here (docs/team-roles.md)
      if (data.user && seesBoard(await checkMe().catch(() => null))) {
        // which brands' posts go out by themselves needs both the board and what's connected here
        Promise.all([sharedBoard(), loadConnectedIg(id ?? "").catch(() => ({}))])
          .then(([b]) => {
            if (!active) return;
            // Every brand's reels: the business filter picks, not the open profile.
            // a board brand linked to one of the brands goes under that brand's name, so it shares its chip
            const label = (brand: string) => (id && profileForBoardBrand(id, brand)?.name) || b.brands.find((x) => x.id === brand)?.name || brand;
            setReels(
              b.cards
                .filter((c) => c.schedule && ["approved", "scheduled", "posted"].includes(c.stage))
                .map((c) => ({
                  id: c.id,
                  title: c.title,
                  date: c.schedule!.slice(0, 10),
                  time: scheduleTime(c.schedule),
                  posted: c.stage === "posted",
                  business: label(brandOf(c)),
                  auto: Boolean(igHandle(brandOf(c))),
                  handle: igHandle(brandOf(c)) ?? null,
                  href: links.reels({ card: c.id, brand: brandOf(c) }),
                })),
            );
            setWaiting(
              b.cards
                .filter((c) => c.stage === "review" || c.stage === "changes")
                .map((c) => ({ id: c.id, title: c.title, business: label(brandOf(c)), brand: brandOf(c), changes: c.stage === "changes", carousel: isCarousel(c) })),
            );
          })
          .catch(() => {}); // the calendar works without the board
      }
      if (canSeeChannelFeeds(data.user?.email)) {
        fetchChannelFeeds()
          .then((items) => active && setFeed(items))
          .catch(() => {}); // the calendar works without the feeds
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // The job rewrites team posts in the cloud (a new version, posted): pull them again when the
  // tab comes back and when a panel opens. Accounts without team posts send nothing extra.
  const hasTeam = teamPosts.length > 0;
  const refreshTeam = useCallback(() => {
    if (!userId || !hasTeam) return;
    void refreshCloudKeys([teamPostsKey(userId), teamReviewsKey(userId)]).then(() => {
      setTeamPosts(readTeamPosts(userId));
      setTeamReviews(readTeamReviews(userId));
    });
  }, [userId, hasTeam]);
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && refreshTeam();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshTeam]);
  // A link with ?teampost= and no ?business= shows the team posts behind the panel. Opening one here names the
  // business on screen instead, so the calendar behind it stays as it was; closing keeps a link's team view.
  const openTeam = (id: string) => {
    setParams((prev) => {
      const p = withParam(prev, "teampost", id);
      if (!p.get("business")) p.set("business", bizFilter.bizSlug);
      return p;
    });
    refreshTeam();
  };
  const closeTeam = () =>
    setParams(
      (prev) => {
        const p = withParam(prev, "teampost", null);
        if (!p.get("business")) p.set("business", slug(TEAM_BUSINESS));
        return p;
      },
      { replace: true },
    );
  const teamOpen = teamPosts.find((p) => p.id === teamOpenId) ?? null;

  const todayKey = localDateKey();

  // The businesses on this calendar: the open profile (its drafts), each reels brand, each channel feed, the team.
  // Shared with the board (BusinessFilter.tsx), so the pick carries between the two.
  const bizFilter = useBusinessFilter([
    profileName,
    ...reels.map((r) => r.business),
    ...otherBrands.map((r) => r.business),
    ...waiting.map((w) => w.business),
    ...feed.map((f) => f.business),
    ...(teamPosts.length ? [TEAM_BUSINESS] : []),
  ], teamOpenId ? slug(TEAM_BUSINESS) : undefined);
  const { bizOn, shows: showsBiz } = bizFilter;

  const visible = useMemo(
    () =>
      showsBiz(profileName)
        ? drafts.filter(
            (d) =>
              (platform === "all" || d.platform === platform) &&
              (status === "all" || draftStatus(d) === status),
          )
        : [],
    [drafts, platform, status, bizOn, profileName],
  );
  // Reels post to Instagram.
  const visibleReels = useMemo(
    () =>
      [...reels, ...otherBrands].filter(
        (r) =>
          showsBiz(r.business) &&
          (platform === "all" || platform === "instagram") &&
          (status === "all" || (status === "posted") === r.posted),
      ),
    [reels, otherBrands, platform, status, bizOn],
  );
  // Channel posts (Telegram first): "Scheduled" covers locked previews and planned posts.
  const visibleFeed = useMemo(
    () =>
      feed.filter(
        (f) =>
          showsBiz(f.business) &&
          (platform === "all" || platform === f.channel.toLowerCase()) &&
          (status === "all" || (status === "posted") === (f.status === "posted")),
      ),
    [feed, platform, status, bizOn],
  );
  // Team posts go to Telegram, not a social platform: shown only under "All platforms".
  const teamByDate = useMemo(() => {
    const map = new Map<string, TeamPost[]>();
    if (platform !== "all" || !showsBiz(TEAM_BUSINESS)) return map;
    for (const p of teamPosts)
      if (status === "all" || (status === "posted") === Boolean(p.postedAt)) map.set(p.day, [...(map.get(p.day) ?? []), p]);
    return map;
  }, [teamPosts, platform, status, bizOn]);

  const byDate = useMemo(() => {
    const map = new Map<string, DraftEntry[]>();
    for (const d of visible) {
      const key = eventDate(d);
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(d);
      map.set(key, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
    return map;
  }, [visible]);

  const unscheduled = useMemo(
    () => drafts.filter((d) => draftStatus(d) === "draft"),
    [drafts],
  );

  const upcoming = useMemo(
    () =>
      visible
        .filter((d) => {
          const key = eventDate(d);
          return key !== null && key >= todayKey;
        })
        .sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1)),
    [visible, todayKey],
  );

  // Scheduled posts whose day has passed: listed above every view, so a post Home
  // calls overdue is never off-screen in a past month or missing from Upcoming.
  const overdue = useMemo(
    () =>
      visible
        .filter((d) => draftStatus(d) === "scheduled" && d.scheduledFor && d.scheduledFor.slice(0, 10) < todayKey)
        .sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1)),
    [visible, todayKey],
  );

  // Home's Reschedule links to #overdue: bring the block into view once it has loaded.
  const hasOverdue = overdue.length > 0;
  useEffect(() => {
    if (hash === "#overdue" && hasOverdue) document.getElementById("overdue")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [hash, hasOverdue]);

  // Recurring posts: their future occurrences for the next 3 months, shown as ghosts.
  const ghostsByDate = useMemo(() => {
    const t = keyToDate(todayKey);
    const until = localDateKey(new Date(t.getFullYear(), t.getMonth() + 3, t.getDate()));
    const map = new Map<string, DraftEntry[]>();
    for (const d of visible) {
      if (!d.repeat || draftStatus(d) !== "scheduled" || !d.scheduledFor) continue;
      for (const day of occurrencesBetween(d.repeat, d.scheduledFor.slice(0, 10), until))
        map.set(day, [...(map.get(day) ?? []), d]);
    }
    return map;
  }, [visible, todayKey]);

  const visibleWaiting = useMemo(() => waiting.filter((w) => showsBiz(w.business)), [waiting, bizOn]);
  // Waiting reels by business, needing changes first, for the side panel.
  const waitingGroups = useMemo(() => {
    const m = new Map<string, { business: string; brand: string; items: typeof waiting }>();
    for (const w of visibleWaiting) {
      const g = m.get(w.business) ?? { business: w.business, brand: w.brand, items: [] };
      g.items.push(w);
      m.set(w.business, g);
    }
    for (const g of m.values()) g.items.sort((a, b) => Number(b.changes) - Number(a.changes));
    return [...m.values()];
  }, [visibleWaiting]);
  // A brand's waiting posts on the board: All when one needs changes, since the default Review chip hides those.
  const groupHref = (g: (typeof waitingGroups)[number]) => links.reels({ brand: g.brand, stage: g.items.some((w) => w.changes) ? "all" : undefined });

  // Coverage: everything dated under the current filters, reduced to business, day and posted or not.
  // Repeats count as planned; skipped team posts don't.
  const coverItems = useMemo<DatedItem[]>(() => {
    const items: DatedItem[] = [];
    for (const d of visible) {
      const date = eventDate(d);
      if (date) items.push({ business: profileName, date, done: draftStatus(d) === "posted" });
    }
    for (const [date, gs] of ghostsByDate) for (let i = 0; i < gs.length; i++) items.push({ business: profileName, date, done: false });
    for (const r of visibleReels) items.push({ business: r.business, date: r.date, done: r.posted });
    for (const f of visibleFeed) items.push({ business: f.business, date: f.date, done: f.status === "posted" });
    for (const [date, ps] of teamByDate)
      for (const p of ps) if (statusOf(p, teamReviews[p.id]) !== "skipped") items.push({ business: TEAM_BUSINESS, date, done: Boolean(p.postedAt) });
    return items;
  }, [visible, ghostsByDate, visibleReels, visibleFeed, teamByDate, teamReviews, profileName]);
  const thisWeek = useMemo(() => weekOf(todayKey), [todayKey]);
  const glance = useMemo(() => weekGlance(coverItems, thisWeek, todayKey), [coverItems, thisWeek, todayKey]);
  // Matched on the filter's business key, so "MoneyBees" the profile and "Moneybees" the feed are one business.
  const runningOut = useMemo(() => {
    const shown = bizFilter.businesses.filter((b) => showsBiz(b.label));
    const keyed = coverItems.map((i) => ({ ...i, business: businessKey(i.business) }));
    return runsOut(keyed, shown.map((b) => b.key), todayKey).map((r) => ({
      ...r,
      business: shown.find((b) => b.key === r.business)?.label ?? r.business,
    }));
  }, [coverItems, bizFilter.businesses, bizOn, todayKey]);
  // Needs you: team posts waiting for approval and reels nobody posts unless Leo does.
  const teamToApprove = useMemo(
    () =>
      showsBiz(TEAM_BUSINESS)
        ? teamPosts.filter((p) => statusOf(p, teamReviews[p.id]) === "waiting").sort((a, b) => (a.day < b.day ? -1 : 1))
        : [],
    [teamPosts, teamReviews, bizOn],
  );
  const handDue = useMemo(() => dueByHand(reels.filter((r) => showsBiz(r.business)), todayKey), [reels, bizOn, todayKey]);

  // Open posting slots for six weeks: a scheduled post at a slot's time (or on its day with no time) takes it.
  const taken = useMemo(
    () => drafts.filter((d) => draftStatus(d) === "scheduled" && d.scheduledFor).map((d) => d.scheduledFor as string),
    [drafts],
  );
  const slotsByDate = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const o of openSlots(slots, taken, new Date(), 42)) map.set(o.date, [...(map.get(o.date) ?? []), o.time]);
    return map;
  }, [slots, taken]);
  // Slots are the open profile's own posting times: shown with its posts, never under Posted.
  const slotsOn = showSlots && slots.length > 0 && showsBiz(profileName) && platform === "all" && status !== "posted";
  const nextSlotThisWeek = useMemo(() => {
    for (const d of thisWeek) for (const t of slotsByDate.get(d) ?? []) return { date: d, time: t };
    return null;
  }, [slotsByDate, thisWeek]);
  // This week against the weekly goal (goals.ts: Home and Plan set it).
  const [goalTick, setGoalTick] = useState(0);
  const progress = useMemo(() => weekProgress(drafts, loadGoals(userId)), [drafts, userId, goalTick]);

  // A starting set of posting times from a posts-per-week goal, at the best time for each weekday; the goal on the
  // main platform becomes the same number, so the week's progress and the slots agree. Undo puts both back.
  const makeSlots = (n: number) => {
    if (!userId) return;
    const platform = loadPositioning(userId)?.platform ?? "linkedin";
    const posts = getTrackedPosts(userId);
    const next = slotsForGoal(n, (wd) => postingTimeOn(posts, platform, wd).time);
    const before = loadBrand(userId);
    const goalsBefore = loadGoals(userId);
    saveBrand(userId, { ...(before ?? DEFAULT_BRAND), slots: next });
    setPlatformGoal(userId, platform, n);
    setSlots(next);
    setGoalTick((t) => t + 1);
    const times = [...new Set(next.map((x) => x.slice(2)))];
    toast({
      title: `Posting times: ${slotDaysLabel(next)}${times.length === 1 ? ` at ${timeLabel(times[0])}` : ""}`,
      description: "Change them any time in Brand kit.",
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => {
            saveBrand(userId, { ...(before ?? DEFAULT_BRAND), slots: before?.slots ?? [] });
            saveGoals(userId, goalsBefore);
            setSlots(before?.slots ?? []);
            setGoalTick((t) => t + 1);
          }}
        >
          Undo
        </ToastAction>
      ),
    });
  };

  const selected = drafts.find((d) => d.id === selectedId) ?? null;

  const undoAction = (prev: DraftEntry) => (
    <ToastAction altText="Undo" onClick={() => userId && setDrafts(restoreDraft(userId, prev))}>
      Undo
    </ToastAction>
  );

  // Puts a draft on a day (and optional time), or moves a scheduled post. Undo puts it back.
  const reschedule = (id: string, next: string) => {
    if (!userId || next.slice(0, 10) < todayKey) return;
    const prev = drafts.find((d) => d.id === id);
    if (!prev || draftStatus(prev) === "posted") return;
    const wasScheduled = draftStatus(prev) === "scheduled";
    if (
      wasScheduled &&
      prev.scheduledFor?.slice(0, 10) === next.slice(0, 10) &&
      scheduleTime(prev.scheduledFor) === scheduleTime(next)
    )
      return;
    setDrafts(setDraftStatus(userId, id, "scheduled", next));
    toast({
      title: `${wasScheduled ? "Moved to" : "Scheduled for"} ${whenLabel(next)}`,
      description: prev.repeat ? `Repeats ${REPEAT_LABEL[prev.repeat.every]} from here` : undefined,
      action: undoAction(prev),
    });
  };

  // A drag or a new date moves the day and keeps the posting time.
  const moveTo = (id: string, day: string) =>
    reschedule(id, scheduleAt(day, scheduleTime(drafts.find((d) => d.id === id)?.scheduledFor)));

  const setPick = (id: string, patch: Partial<{ date: string; time: string }>) =>
    setRowPick((m) => ({ ...m, [id]: { date: "", time: "", ...m[id], ...patch } }));

  const markPosted = (id: string) => {
    const prev = drafts.find((d) => d.id === id);
    if (!userId || !prev) return;
    const blocked = reviews.blockReason(prev);
    if (blocked) {
      toast({ title: "Approval needed before posting", description: `Team rule. ${blocked}` });
      return;
    }
    const before = drafts;
    const next = setDraftStatus(userId, id, "posted");
    setDrafts(next);
    const series = next.find((d) => d.id === id && d.repeat);
    toast({
      title: "Marked as posted",
      description: series?.scheduledFor ? `Next one: ${whenLabel(series.scheduledFor)}` : undefined,
      action: (
        <ToastAction altText="Undo" onClick={() => setDrafts(undoPosted(userId, prev, before))}>
          Undo
        </ToastAction>
      ),
    });
  };

  const changeRepeat = (d: DraftEntry, every: RepeatEvery | null) => {
    if (!userId) return;
    setDrafts(setRepeat(userId, d.id, every));
    toast({ title: every ? `Repeats ${REPEAT_LABEL[every]}` : "No longer repeats", action: undoAction(d) });
  };

  const skip = (d: DraftEntry, day: string) => {
    if (!userId) return;
    setDrafts(skipOccurrence(userId, d.id, day));
    if (selectedGhost === day) closePost();
    toast({ title: `Skipped ${dayLabel(day)}`, action: undoAction(d) });
  };

  const openNote = (n: CalNote | null, date?: string) => {
    setNoteForm(n ? { ...n } : { id: null, date: date ?? (anchor > todayKey ? anchor : todayKey), title: "", color: "brand" });
    requestAnimationFrame(() => noteRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  const submitNote = () => {
    if (!userId || !noteForm || !noteForm.title.trim() || !noteForm.date) return;
    const note: CalNote = { ...noteForm, id: noteForm.id ?? newNoteId() };
    setNotes(saveNote(userId, note));
    setNoteForm(null);
    toast({ title: noteForm.id ? "Note saved" : `Note added to ${dayLabel(note.date)}` });
  };

  const removeNote = (id: string) => {
    const prev = notes.find((n) => n.id === id);
    if (!userId || !prev) return;
    setNotes(deleteNote(userId, id));
    setNoteForm(null);
    toast({
      title: "Note deleted",
      action: (
        <ToastAction altText="Undo" onClick={() => setNotes(saveNote(userId, prev))}>
          Undo
        </ToastAction>
      ),
    });
  };

  const select = (id: string, ghostDay: string | null = null) => {
    const same = selectedId === id && selectedGhost === ghostDay;
    if (same) closePost();
    else openPost(id);
    setSelectedGhost(ghostDay);
    // On a phone the editor can sit above the fold of a long week.
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  // Drag and drop (desktop): scheduled posts and unscheduled drafts drop on today or later.
  const dragProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, id);
      e.dataTransfer.effectAllowed = "move";
      setDragging(id);
    },
    onDragEnd: () => {
      setDragging(null);
      setDragOver(null);
    },
  });
  const dropProps = (key: string) =>
    key < todayKey
      ? {}
      : {
          onDragOver: (e: DragEvent) => {
            if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (dragOver !== key) setDragOver(key);
          },
          onDragLeave: (e: DragEvent) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(null);
          },
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            setDragOver(null);
            setDragging(null); // the dragged card can unmount on drop, so dragend may never fire
            const id = e.dataTransfer.getData(DRAG_TYPE);
            if (id) moveTo(id, key);
          },
        };

  // A copy of the post, scheduled at the next open slot (or the best time); Undo removes it and brings back
  // any post the copy pushed out of My posts.
  const duplicateToSlot = (d: DraftEntry) => {
    if (!userId) return;
    const r = duplicateDraft(userId, d.id);
    if (!r) return;
    const next = suggestPostingTime(getTrackedPosts(userId), d.platform, taken, new Date(), slots);
    setDrafts(setDraftStatus(userId, r.copy.id, "scheduled", next.at));
    const pushedOut = r.dropped[0];
    toast({
      title: `Copy scheduled for ${whenLabel(next.at)}`,
      description: pushedOut
        ? `My posts keeps ${MAX_DRAFTS}, so "${(pushedOut.hook || pushedOut.draft).slice(0, 40)}" was removed. Undo brings it back.`
        : undefined,
      action: (
        <ToastAction altText="Undo" onClick={() => setDrafts(undoDuplicate(userId, r.copy.id, r.dropped))}>
          Undo
        </ToastAction>
      ),
    });
  };

  // Takes the post off the calendar: it waits in Unscheduled drafts. Undo puts it back on its day.
  const unschedule = (d: DraftEntry) => {
    if (!userId) return;
    setDrafts(setDraftStatus(userId, d.id, "draft"));
    closePost();
    toast({ title: "Back in drafts", description: "It waits in Unscheduled drafts.", action: undoAction(d) });
  };

  // One-tap days for a scheduled post: today (when it is overdue), tomorrow, the next open slot.
  const presets = (d: DraftEntry) => {
    const day = d.scheduledFor?.slice(0, 10);
    const time = scheduleTime(d.scheduledFor);
    const out: { label: string; at: string }[] = [];
    if (day && day < todayKey) out.push({ label: "Today", at: scheduleAt(todayKey, time) });
    if (day !== addDays(todayKey, 1)) out.push({ label: "Tomorrow", at: scheduleAt(addDays(todayKey, 1), time) });
    if (slots.length && userId) {
      const at = suggestPostingTime(getTrackedPosts(userId), d.platform, taken.filter((x) => x !== d.scheduledFor), new Date(), slots).at;
      if (at !== d.scheduledFor) out.push({ label: "Next slot", at });
    }
    return out;
  };

  const moveInput = (d: DraftEntry) => (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
      <label className="flex items-center gap-1.5 whitespace-nowrap">
        Move to
        <DayInput
          min={todayKey}
          value={d.scheduledFor?.slice(0, 10) ?? ""}
          onPick={(day) => moveTo(d.id, day)}
          className={dateInputClass}
        />
      </label>
      <label className="flex items-center gap-1.5 whitespace-nowrap">
        at
        <input
          type="time"
          value={scheduleTime(d.scheduledFor) ?? ""}
          onChange={(e) => d.scheduledFor && reschedule(d.id, scheduleAt(d.scheduledFor.slice(0, 10), e.target.value))}
          aria-label="Posting time"
          className={dateInputClass}
        />
      </label>
      <select
        value={d.repeat?.every ?? ""}
        onChange={(e) => changeRepeat(d, (e.target.value || null) as RepeatEvery | null)}
        aria-label="Repeat"
        className={dateInputClass}
      >
        <option value="">Doesn't repeat</option>
        <option value="week">Weekly</option>
        <option value="2weeks">Every 2 weeks</option>
        <option value="month">Monthly</option>
      </select>
      {d.repeat && d.scheduledFor && (
        <button
          type="button"
          onClick={() => skip(d, d.scheduledFor!.slice(0, 10))}
          className="h-9 rounded-md px-2 font-semibold text-muted-foreground hover:text-foreground sm:h-8 [@media(pointer:coarse)]:h-11"
        >
          Skip this one
        </button>
      )}
      {presets(d).map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => reschedule(d.id, p.at)}
          title={`Move to ${whenLabel(p.at)}`}
          className="h-9 rounded-md border border-border/70 px-2 font-semibold text-foreground hover:border-primary/40 sm:h-8 [@media(pointer:coarse)]:h-11"
        >
          {p.label}
        </button>
      ))}
    </div>
  );

  const editor = (d: DraftEntry) => {
    const posted = draftStatus(d) === "posted";
    const ghost = selectedGhost && d.repeat ? selectedGhost : null;
    if (ghost) {
      const time = scheduleTime(d.scheduledFor);
      return (
        <div className="space-y-2 rounded-xl border border-dashed border-primary/50 bg-card p-3 shadow-card">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground">
                {dayLabel(ghost)}
                {time && `, ${timeLabel(time)}`} · repeats {REPEAT_LABEL[d.repeat!.every]}
              </p>
              <p className="line-clamp-2 text-sm font-medium text-foreground">{titleOf(d)}</p>
            </div>
            <button
              type="button"
              onClick={closePost}
              aria-label="Close"
              className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-9 px-3 text-xs sm:h-8 [@media(pointer:coarse)]:h-11">
              <Link to={`/generate?draft=${encodeURIComponent(d.id)}`}>Open</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => skip(d, ghost)} className="h-9 px-3 text-xs sm:h-8 [@media(pointer:coarse)]:h-11">
              Skip this one
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-2 rounded-xl border border-primary/30 bg-card p-3 shadow-card">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">
              {PLATFORM_LABEL[d.platform] ?? (d.platform || "Post")} · {posted ? "Posted" : "Scheduled"}
              {!posted && d.repeat && ` · repeats ${REPEAT_LABEL[d.repeat.every]}`}
            </p>
            <p className="line-clamp-2 text-sm font-medium text-foreground">{titleOf(d)}</p>
          </div>
          <CopyLinkButton label="Copy link to this post" className="-mt-1" />
          <button
            type="button"
            onClick={closePost}
            aria-label="Close"
            className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {d.zernio?.postId && userId && <ZernioStatus userId={userId} draft={d} onDrafts={setDrafts} />}
        <div className="flex flex-wrap items-center gap-2">
          {!posted && moveInput(d)}
          <Button asChild variant="outline" size="sm" className="h-9 px-3 text-xs sm:h-8 [@media(pointer:coarse)]:h-11">
            <Link to={`/generate?draft=${encodeURIComponent(d.id)}`}>Open</Link>
          </Button>
          {!posted && (
            <Button
              size="sm"
              onClick={() => markPosted(d.id)}
              disabled={reviews.blockReason(d) !== null}
              title={reviews.blockReason(d) ?? undefined}
              className="h-9 gap-1 px-3 text-xs sm:h-8 [@media(pointer:coarse)]:h-11"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Mark posted
            </Button>
          )}
          {!posted && d.scheduledFor && !d.zernio?.postId && socialConnectShown() && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPostOpenId((cur) => (cur === d.id ? null : d.id))}
              aria-expanded={postOpenId === d.id}
              className="h-9 px-3 text-xs text-primary hover:text-primary sm:h-8 [@media(pointer:coarse)]:h-11"
            >
              Post it for me
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs">
          <button
            type="button"
            onClick={() => setPreviewId((cur) => (cur === d.id ? null : d.id))}
            aria-expanded={previewId === d.id}
            className="h-9 rounded-md px-2 font-semibold text-primary hover:underline sm:h-8 [@media(pointer:coarse)]:h-11"
          >
            {previewId === d.id ? "Hide preview" : `Preview on ${PLATFORM_LABEL[d.platform] ?? "the network"}`}
          </button>
          <button
            type="button"
            onClick={() => duplicateToSlot(d)}
            className="h-9 rounded-md px-2 font-semibold text-muted-foreground hover:text-foreground sm:h-8 [@media(pointer:coarse)]:h-11"
          >
            Duplicate
          </button>
          {!posted && (
            <button
              type="button"
              onClick={() => unschedule(d)}
              className="h-9 rounded-md px-2 font-semibold text-muted-foreground hover:text-foreground sm:h-8 [@media(pointer:coarse)]:h-11"
            >
              Back to drafts
            </button>
          )}
        </div>
        {previewId === d.id && (
          <div className="max-w-sm">
            <PostPreview text={d.draft} platform={d.platform} format={d.format} />
          </div>
        )}
        {postOpenId === d.id && userId && (
          <PostItForMePanel userId={userId} draft={d} blockReason={reviews.blockReason(d)} onDrafts={setDrafts} onClose={() => setPostOpenId(null)} />
        )}
      </div>
    );
  };

  // A post on the month or week grid: drag it to another day, tap it for its controls.
  const chip = (e: DraftEntry, roomy: boolean) => {
    const posted = draftStatus(e) === "posted";
    const late = !posted && (e.scheduledFor ?? "").slice(0, 10) < todayKey;
    const time = posted ? null : scheduleTime(e.scheduledFor);
    return (
      <div
        key={e.id}
        role="button"
        tabIndex={0}
        {...(posted ? {} : dragProps(e.id))}
        onClick={() => select(e.id)}
        onKeyDown={(k) => {
          if (k.key !== "Enter" && k.key !== " ") return;
          k.preventDefault();
          select(e.id);
        }}
        title={`${PLATFORM_LABEL[e.platform] ?? (e.platform || "Post")}: ${e.hook || e.draft.slice(0, 60)}`}
        className={`w-full rounded px-1.5 py-0.5 text-left text-[10px] font-medium ${
          posted
            ? "bg-success/15 text-success"
            : `cursor-grab active:cursor-grabbing ${late ? "bg-warning/15 text-warning" : "bg-primary/15 text-primary"}`
        } ${roomy ? "py-1.5 text-xs sm:py-1 sm:text-[11px]" : "truncate"} ${
          dragging === e.id ? "opacity-40" : ""
        } ${selectedId === e.id && !selectedGhost ? "ring-2 ring-primary" : ""}`}
      >
        {roomy ? (
          <>
            <span className="block text-[10px] opacity-80">
              {e.repeat && <RepeatIcon className="mr-1 inline h-2.5 w-2.5 align-[-1px]" aria-label="Repeats" />}
              {PLATFORM_LABEL[e.platform] ?? e.platform}
              {time && ` · ${timeLabel(time)}`}
            </span>
            <span className="line-clamp-2">{titleOf(e)}</span>
            {e.zernio?.postId && (
              <span className="mt-1 block">
                <ZernioChipLabel draft={e} />
              </span>
            )}
          </>
        ) : (
          <>
            <ZernioChipLabel draft={e} compact />
            {time && <span className="font-semibold">{timeLabel(time)} </span>}
            {titleOf(e)}
          </>
        )}
      </div>
    );
  };

  // How a reel goes out: by itself to its Instagram account, or by Leo's hand.
  const reelHow = (r: (typeof reels)[number]) => (r.auto ? `posts to @${r.handle} automatically` : "post it by hand");

  const reelChip = (r: (typeof reels)[number], roomy: boolean) => (
    <button
      key={r.id}
      type="button"
      onClick={() => navigate(r.href)}
      title={`${r.business} reel${r.time ? `, ${timeLabel(r.time)}` : ""}: ${r.title} (${r.posted ? "posted" : reelHow(r)})`}
      className={`block w-full rounded px-1.5 py-0.5 text-left text-[10px] font-medium ${
        roomy ? "py-1.5 text-xs sm:py-1 sm:text-[11px]" : "truncate"
      } ${r.posted ? "bg-success/15 text-success" : !r.auto && r.date <= todayKey ? "bg-warning/15 text-warning" : "bg-brand/15 text-brand"}`}
    >
      {roomy ? (
        <>
          <span className="block text-[10px] opacity-80">
            {r.business} · Reel{r.time && ` · ${timeLabel(r.time)}`}
            {!r.posted && !r.auto && " · by hand"}
          </span>
          <span className="line-clamp-2">{r.title}</span>
        </>
      ) : (
        <>
          {r.posted || r.auto ? (
            <Clapperboard className="mr-0.5 inline h-2.5 w-2.5 align-[-1px]" aria-label="Reel" />
          ) : (
            <Hand className="mr-0.5 inline h-2.5 w-2.5 align-[-1px]" aria-label="Reel, post it by hand" />
          )}
          {r.title}
        </>
      )}
    </button>
  );

  // A channel post (from a feed): tap it to see the whole post, every picture and the caption.
  const feedChip = (f: CalendarFeedItem, roomy: boolean) => (
    <button
      key={f.id}
      type="button"
      onClick={() => openFeedItem(f.id)}
      title={`${f.business} ${f.channel}: ${f.title}`}
      className={`block w-full rounded px-1.5 py-0.5 text-left text-[10px] font-medium ${
        roomy ? "py-1.5 text-xs sm:py-1 sm:text-[11px]" : "truncate"
      } ${f.status === "posted" ? "bg-success/15 text-success" : "bg-sky-500/15 text-sky-700 dark:text-sky-300"}`}
    >
      {roomy ? (
        <>
          <span className="block text-[10px] opacity-80">
            {f.business} · {f.channel}
            {f.time && ` · ${timeLabel(f.time)}`}
          </span>
          <span className="line-clamp-2">{f.title}</span>
        </>
      ) : (
        f.title
      )}
    </button>
  );

  // A future occurrence of a recurring post: not draggable (move the real one), tap to skip it.
  const ghostChip = (e: DraftEntry, day: string, roomy: boolean) => {
    const time = scheduleTime(e.scheduledFor);
    return (
      <div
        key={`${e.id}@${day}`}
        role="button"
        tabIndex={0}
        onClick={() => select(e.id, day)}
        onKeyDown={(k) => {
          if (k.key !== "Enter" && k.key !== " ") return;
          k.preventDefault();
          select(e.id, day);
        }}
        title={`Repeats ${REPEAT_LABEL[e.repeat!.every]}: ${titleOf(e)}`}
        className={`w-full rounded border border-dashed border-primary/50 px-1.5 text-left font-medium text-primary ${
          roomy ? "py-1.5 text-xs sm:py-1 sm:text-[11px]" : "truncate py-0.5 text-[10px]"
        } ${selectedId === e.id && selectedGhost === day ? "ring-2 ring-primary" : ""}`}
      >
        <RepeatIcon className="mr-1 inline h-2.5 w-2.5 align-[-1px]" aria-label="Repeats" />
        {roomy ? (
          <>
            {PLATFORM_LABEL[e.platform] ?? e.platform}
            {time && ` · ${timeLabel(time)}`}
            <span className="line-clamp-2">{titleOf(e)}</span>
          </>
        ) : (
          <>
            {time && `${timeLabel(time)} `}
            {titleOf(e)}
          </>
        )}
      </div>
    );
  };

  const teamChip = (p: TeamPost, roomy: boolean) => (
    <TeamPostChip key={p.id} post={p} status={statusOf(p, teamReviews[p.id])} roomy={roomy} onOpen={() => openTeam(p.id)} />
  );

  const keyDateLine = (k: SgDate, roomy: boolean) => (
    <p
      key={k.title}
      title={sgDateLabel(k)}
      className={`text-[10px] font-medium ${roomy ? "" : "truncate"} ${
        k.kind === "holiday" ? "text-destructive" : "text-muted-foreground"
      }`}
    >
      {k.kind === "money" && <Coins className="mr-0.5 inline h-2.5 w-2.5 align-[-1px]" aria-hidden />}
      {sgDateLabel(k)}
    </p>
  );

  const noteChip = (n: CalNote, roomy: boolean) => (
    <button
      key={n.id}
      type="button"
      onClick={() => openNote(n)}
      className={`flex w-full items-center gap-1 rounded bg-muted/70 px-1.5 text-left font-medium text-foreground hover:bg-muted ${
        roomy ? "py-1.5 text-xs sm:py-1 sm:text-[11px]" : "py-0.5 text-[10px]"
      }`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${NOTE_SWATCH[n.color]}`} aria-hidden />
      <span className={roomy ? "line-clamp-2" : "truncate"}>{n.title}</span>
    </button>
  );

  // A day's panel: everything on it, plus "Write a post for this day" and "Add note".
  const openDay = (key: string) => {
    if (dayOpen === key) closeDay();
    else openDayParam(key);
    requestAnimationFrame(() => dayRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };
  // Tapping an empty part of a day opens it; chips and buttons inside keep their own action.
  const cellClick = (key: string) => (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a, input, select, [role=button]")) return;
    openDay(key);
  };

  // Day number: tap it to open the day.
  const dayNumber = (key: string, className: string) => (
    <button
      type="button"
      onClick={() => openDay(key)}
      aria-label={`Open ${dayLabel(key)}`}
      aria-expanded={dayOpen === key}
      title="Open this day"
      className={`${className} hover:ring-2 hover:ring-border`}
    >
      {keyToDate(key).getDate()}
    </button>
  );

  // An open posting slot: tap it to write a post that lands at that time.
  // Drop a post or draft on it and it moves to that slot's day and time (not just the day, as the cell would).
  const slotChip = (date: string, time: string, roomy: boolean) => (
    <Link
      key={`slot-${date}-${time}`}
      to={`/generate?day=${date}&time=${time}`}
      title={dragging ? `Drop to post at ${timeLabel(time)}` : `Open posting slot, ${timeLabel(time)}: write a post for it`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation(); // the day cell underneath would move the day but keep the old time
        setDragOver(null);
        setDragging(null);
        const id = e.dataTransfer.getData(DRAG_TYPE);
        if (id) reschedule(id, scheduleAt(date, time));
      }}
      className={`block w-full rounded border border-dashed px-1.5 text-left font-medium hover:border-primary hover:text-primary ${
        dragging ? "border-primary bg-primary/5 text-primary" : "border-muted-foreground/50 text-muted-foreground"
      } ${roomy ? "py-1.5 text-xs sm:py-1 sm:text-[11px]" : "truncate py-0.5 text-[10px]"}`}
    >
      {roomy ? (
        <>
          <span className="block text-[10px] opacity-80">Open slot · {timeLabel(time)}</span>
          Write for this slot
        </>
      ) : (
        `+ ${timeLabel(time)}`
      )}
    </Link>
  );

  // Everything dated on one day under the current filters.
  const dayThings = (key: string) => ({
    slots: slotsOn && key >= todayKey ? slotsByDate.get(key) ?? [] : [],
    events: byDate.get(key) ?? [],
    ghosts: ghostsByDate.get(key) ?? [],
    reels: visibleReels.filter((r) => r.date === key),
    feed: visibleFeed.filter((f) => f.date === key),
    team: teamByDate.get(key) ?? [],
  });

  // One coloured dot per item, for the month grid on phones (same colours as the chips).
  const dayDots = (key: string) => {
    const t = dayThings(key);
    return [
      ...(keyDates.get(key) ?? []).filter((k) => k.kind === "holiday").map((k) => ({ id: `k${k.title}`, tone: "bg-destructive" })),
      ...(notesByDate.get(key) ?? []).map((n) => ({ id: n.id, tone: "border border-muted-foreground" })),
      ...t.events.map((e) => ({
        id: e.id,
        tone: draftStatus(e) === "posted" ? "bg-success" : (e.scheduledFor ?? "").slice(0, 10) < todayKey ? "bg-warning" : "bg-primary",
      })),
      ...t.ghosts.map((g) => ({ id: `${g.id}@`, tone: "border border-primary" })),
      ...t.reels.map((r) => ({ id: r.id, tone: r.posted ? "bg-success" : !r.auto && r.date <= todayKey ? "bg-warning" : "bg-brand" })),
      ...t.feed.map((f) => ({ id: f.id, tone: f.status === "posted" ? "bg-success" : "bg-sky-500" })),
      ...t.team.map((p) => {
        const st = statusOf(p, teamReviews[p.id]);
        return { id: p.id, tone: st === "waiting" ? "bg-warning" : st === "posted" ? "bg-success" : "bg-muted-foreground/60" };
      }),
    ];
  };
  const DOT_LABEL: Record<string, string> = {
    "bg-warning": "Overdue or waiting for you",
    "bg-primary": "Your post",
    "border border-primary": "Repeats",
    "bg-brand": "Reel",
    "bg-sky-500": "Channel post",
    "bg-muted-foreground/60": "Team post",
    "bg-success": "Posted",
    "border border-muted-foreground": "Note",
    "bg-destructive": "Holiday",
  };

  const dayPanel = (key: string) => {
    const t = dayThings(key);
    return (
      <div ref={dayRef} className="scroll-mt-4 space-y-2 rounded-xl border border-primary/30 bg-card p-3 shadow-card">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-sm font-semibold text-foreground">
            {keyToDate(key).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <CopyLinkButton label="Copy link to this day" className="-mt-1" />
          <button
            type="button"
            onClick={closeDay}
            aria-label="Close day"
            className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-1.5">
          {(sgDatesBetween(key, key).get(key) ?? []).map((k) => keyDateLine(k, true))}
          {(notesByDate.get(key) ?? []).map((n) => noteChip(n, true))}
          {t.events.map((e) => chip(e, true))}
          {t.ghosts.map((g) => ghostChip(g, key, true))}
          {t.reels.map((r) => reelChip(r, true))}
          {t.feed.map((f) => feedChip(f, true))}
          {t.team.map((p) => teamChip(p, true))}
          {t.slots.map((time) => slotChip(key, time, true))}
        </div>
        <div className="flex flex-wrap gap-2">
          {key >= todayKey && (
            <Button asChild size="sm" className="h-9 gap-1.5 px-3 text-xs sm:h-8 [@media(pointer:coarse)]:h-11">
              <Link to={`/generate?day=${key}`}>
                <PenLine className="h-3.5 w-3.5" /> Write a post for this day
              </Link>
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              closeDay();
              openNote(null, key);
            }}
            className="h-9 gap-1.5 px-3 text-xs sm:h-8 [@media(pointer:coarse)]:h-11"
          >
            <StickyNote className="h-3.5 w-3.5" /> Add note
          </Button>
        </div>
      </div>
    );
  };

  // The day the month or week view is showing: the link's week or month, else the open item's day (a link to a
  // team post in November opens November behind it), else today.
  const focusDay = dayOpen ?? teamOpen?.day ?? openFeed?.date ?? (selected && !selectedGhost ? eventDate(selected) : null);
  const anchor = linkDay(params.get("week")) ?? (linkMonth(params.get("month")) ? `${params.get("month")}-01` : null) ?? focusDay ?? todayKey;
  const anchorDate = keyToDate(anchor);
  const grid = useMemo(() => {
    const d = keyToDate(anchor);
    return monthGrid(d.getFullYear(), d.getMonth());
  }, [anchor]);
  const week = useMemo(() => weekOf(anchor), [anchor]);

  const [rangeFrom, rangeTo] =
    view === "month" ? [grid[0], grid[41]] : view === "week" ? [week[0], week[6]] : [todayKey, addDays(todayKey, KEY_DATE_DAYS)];
  const keyDates = useMemo(() => sgDatesBetween(rangeFrom, rangeTo), [rangeFrom, rangeTo]);
  const notesByDate = useMemo(() => {
    const map = new Map<string, CalNote[]>();
    for (const n of notes) map.set(n.date, [...(map.get(n.date) ?? []), n]);
    return map;
  }, [notes]);
  // The month's legend: only the colours this month actually uses, in DOT_LABEL order.
  const monthTones = view === "month" ? new Set(grid.flatMap((k) => dayDots(k).map((d) => d.tone))) : new Set<string>();
  const monthLegend = Object.entries(DOT_LABEL)
    .filter(([tone]) => monthTones.has(tone))
    .map(([tone, label]) => ({ tone, label }));

  // Upcoming: posts, reels, notes and the next few weeks of key dates, in date order
  // (key dates first in a day, then notes, then posts by time).
  type ListItem =
    | { kind: "key"; date: string; item: SgDate }
    | { kind: "note"; date: string; item: CalNote }
    | { kind: "reel"; date: string; item: (typeof reels)[number] }
    | { kind: "feed"; date: string; item: CalendarFeedItem }
    | { kind: "team"; date: string; item: TeamPost }
    | { kind: "post"; date: string; item: DraftEntry }
    | { kind: "ghost"; date: string; item: DraftEntry }
    | { kind: "slot"; date: string; item: string };
  const listItems = useMemo(() => {
    const items: (ListItem & { order: string })[] = [];
    if (view !== "upcoming") return items;
    for (const [date, ks] of keyDates) for (const k of ks) items.push({ kind: "key", date, item: k, order: `${date}|0` });
    for (const n of notes) if (n.date >= todayKey) items.push({ kind: "note", date: n.date, item: n, order: `${n.date}|1` });
    for (const r of visibleReels)
      if (r.date >= todayKey && !r.posted) items.push({ kind: "reel", date: r.date, item: r, order: `${r.date}|2` });
    for (const f of visibleFeed)
      if (f.date >= todayKey && f.status !== "posted") items.push({ kind: "feed", date: f.date, item: f, order: `${f.date}|3|${f.time}` });
    for (const [date, ps] of teamByDate) if (date >= todayKey) for (const p of ps) items.push({ kind: "team", date, item: p, order: `${date}|2` });
    for (const d of upcoming) items.push({ kind: "post", date: eventDate(d)!, item: d, order: `${eventDate(d)}|3|${sortKey(d)}` });
    // Repeats run as far ahead as the key dates do, so one weekly post doesn't fill three months.
    for (const [date, gs] of ghostsByDate) if (date <= rangeTo) for (const g of gs) items.push({ kind: "ghost", date, item: g, order: `${date}|4` });
    // Open slots for two weeks, between the posts by time.
    if (slotsOn)
      for (const [date, times] of slotsByDate)
        if (date <= addDays(todayKey, 13)) for (const t of times) items.push({ kind: "slot", date, item: t, order: `${date}|3|${date}T${t}` });
    return items.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  }, [view, keyDates, notes, visibleReels, visibleFeed, teamByDate, upcoming, ghostsByDate, todayKey, rangeTo, slotsOn, slotsByDate]);

  const shortDay = (key: string) => keyToDate(key).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const dateBadge = (key: string) => (
    <div className="w-14 shrink-0 text-center">
      <div className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${key === todayKey ? "text-primary" : "text-muted-foreground"}`}>
        {key === todayKey
          ? "Today"
          : key === addDays(todayKey, 1)
            ? "Tmrw"
            : keyToDate(key).toLocaleDateString(undefined, { weekday: "short", month: "short" })}
      </div>
      <div className="font-serif text-lg font-semibold text-foreground">{keyToDate(key).getDate()}</div>
    </div>
  );

  // A post as a row (Upcoming list and the overdue block): open it, move it, mark it posted.
  const postRow = (e: DraftEntry, date: string) => {
    const posted = draftStatus(e) === "posted";
    const late = !posted && date < todayKey;
    const time = scheduleTime(e.scheduledFor);
    return (
      <div key={e.id} className="flex items-start gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-card">
        {dateBadge(date)}
        <div className="min-w-0 flex-1 space-y-1.5">
          <button
            type="button"
            onClick={() => navigate(`/generate?draft=${encodeURIComponent(e.id)}`)}
            className="block w-full min-w-0 text-left"
          >
            <p className="truncate text-sm font-medium text-foreground">{titleOf(e)}</p>
            <p className="text-xs text-muted-foreground">
              {PLATFORM_LABEL[e.platform] ?? e.platform} ·{" "}
              {posted ? (
                "Posted"
              ) : late ? (
                <span className="font-medium text-warning">{overdueLabel(daysOverdue(date, todayKey))}</span>
              ) : time ? (
                `Scheduled ${timeLabel(time)}`
              ) : (
                "Scheduled"
              )}
              {!posted && e.repeat && ` · repeats ${REPEAT_LABEL[e.repeat.every]}`}
            </p>
          </button>
          <ZernioChipLabel draft={e} />
          {!posted && moveInput(e)}
        </div>
        {!posted && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => markPosted(e.id)}
            disabled={reviews.blockReason(e) !== null}
            title={reviews.blockReason(e) ?? undefined}
            className="h-9 shrink-0 gap-1.5 px-2.5 text-xs text-success hover:text-success sm:h-8 [@media(pointer:coarse)]:h-11"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Mark posted
          </Button>
        )}
      </div>
    );
  };

  const navLabel =
    view === "week"
      ? `${keyToDate(week[0]).toLocaleDateString(undefined, { day: "numeric", month: "short" })} - ${keyToDate(
          week[6],
        ).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
      : anchorDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  // Paging writes ?week= (its Monday) or ?month=, left out for the current week or month.
  const showDay = (day: string) =>
    setParams(
      (prev) => {
        const p = withParam(withParam(prev, "month", null), "week", null);
        return view === "week"
          ? withParam(p, "week", weekOf(day)[0], weekOf(todayKey)[0])
          : withParam(p, "month", day.slice(0, 7), todayKey.slice(0, 7));
      },
      { replace: true },
    );
  const shift = (delta: number) => {
    const d = keyToDate(anchor);
    showDay(view === "week" ? addDays(anchor, delta * 7) : localDateKey(new Date(d.getFullYear(), d.getMonth() + delta, 1)));
  };

  const viewButton = (v: View, label: string, Icon: typeof List) => (
    <button
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold sm:h-8 [@media(pointer:coarse)]:h-11 ${
        view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );

  const dropHighlight = (key: string) => (dragOver === key ? "bg-primary/10 ring-2 ring-inset ring-primary" : "");

  return (
    <div className="space-y-6">
      <SectionTabs tabs={PIPELINE_TABS} />
      <header>
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          Calendar
        </h1>
      </header>

      {/* View, filters, navigation */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border/70 bg-muted/30 p-0.5">
          {viewButton("month", "Month", CalendarDays)}
          {viewButton("week", "Week", CalendarRange)}
          {viewButton("upcoming", "Upcoming", List)}
        </div>
        <div className="flex gap-2">
          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger aria-label="Platform" className="h-9 w-[8rem] text-xs sm:h-8 [@media(pointer:coarse)]:h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All platforms</SelectItem>
              {Object.entries(PLATFORM_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger aria-label="Status" className="h-9 w-[7rem] text-xs sm:h-8 [@media(pointer:coarse)]:h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <button
          type="button"
          onClick={() => openNote(null)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border/70 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground sm:h-8 [@media(pointer:coarse)]:h-11"
        >
          <StickyNote className="h-3.5 w-3.5" /> Add note
        </button>
        {slots.length > 0 && (
          <button
            type="button"
            aria-pressed={showSlots}
            onClick={() => {
              const next = !showSlots;
              setShowSlots(next);
              try {
                localStorage.setItem("cs-calendar-slots", next ? "on" : "off");
              } catch {
                /* the toggle still works for this visit */
              }
            }}
            className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold sm:h-8 [@media(pointer:coarse)]:h-11 ${
              showSlots ? "border-primary/40 bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground"
            }`}
          >
            Open slots
          </button>
        )}
        {view !== "upcoming" && (
          <div className="flex items-center gap-1.5 sm:ml-auto">
            <button
              type="button"
              onClick={() => shift(-1)}
              className="grid h-9 w-9 place-items-center rounded-md border border-border/70 text-muted-foreground hover:text-foreground sm:h-8 sm:w-8 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
              aria-label={view === "week" ? "Previous week" : "Previous month"}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[8.5rem] text-center text-sm font-semibold text-foreground">{navLabel}</span>
            <button
              type="button"
              onClick={() => shift(1)}
              className="grid h-9 w-9 place-items-center rounded-md border border-border/70 text-muted-foreground hover:text-foreground sm:h-8 sm:w-8 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
              aria-label={view === "week" ? "Next week" : "Next month"}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => showDay(todayKey)}
              className="h-9 rounded-md border border-border/70 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground sm:h-8 [@media(pointer:coarse)]:h-11"
            >
              Today
            </button>
          </div>
        )}
      </div>

      <BusinessChips filter={bizFilter} label={bizName} />

      {(teamToApprove.length > 0 || handDue.length > 0 || waitingGroups.length > 0) && (
        <section aria-label="Needs you" className="space-y-2 rounded-xl border border-warning/40 bg-warning/5 p-3">
          <p className="text-sm font-semibold text-foreground">Needs you</p>
          {teamToApprove.length > 0 && (
            <button
              type="button"
              onClick={() => openTeam(teamToApprove[0].id)}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg bg-card px-3 py-2 text-left shadow-card hover:bg-muted/40"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">
                  {teamToApprove.length} team post{teamToApprove.length > 1 ? "s" : ""} to approve
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  Next: {teamToApprove[0].title} · {dayLabel(teamToApprove[0].day)}
                </span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-primary">Review</span>
            </button>
          )}
          {waitingGroups.map((g) => (
            <Link
              key={g.business}
              to={groupHref(g)}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg bg-card px-3 py-2 text-left shadow-card hover:bg-muted/40"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {g.business}: {g.items.length} post{g.items.length > 1 ? "s" : ""} to review
              </span>
              <span className="shrink-0 text-xs font-semibold text-primary">Review</span>
            </Link>
          ))}
          {handDue.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => navigate(r.href)}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg bg-card px-3 py-2 text-left shadow-card hover:bg-muted/40"
            >
              <Hand className="h-4 w-4 shrink-0 text-warning" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">Post by hand: {r.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {r.business} reel · {r.date < todayKey ? overdueLabel(daysOverdue(r.date, todayKey)) : "today"}
                  {r.time && `, ${timeLabel(r.time)}`}
                </span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-primary">Open</span>
            </button>
          ))}
        </section>
      )}

      {status === "all" && (
        <section aria-label="This week" className="space-y-1.5 rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-card">
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-foreground">
            <CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="font-semibold">This week:</span>
            <span>{glance.going ? `${glance.going} going out` : "nothing going out"}</span>
            {glance.posted > 0 && <span className="text-muted-foreground">· {glance.posted} posted</span>}
            {glance.going > 0 && glance.emptyDays.length > 0 && (
              <span className="text-muted-foreground">
                · nothing on {glance.emptyDays.map((d) => keyToDate(d).toLocaleDateString(undefined, { weekday: "short" })).join(", ")}
              </span>
            )}
          </p>
          {showsBiz(profileName) && progress.goal > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {profileName}: {Math.min(progress.goal, progress.posted + progress.scheduled)} of {progress.goal} planned
              </span>
              <span
                role="progressbar"
                aria-label={`${profileName} weekly goal`}
                aria-valuemin={0}
                aria-valuemax={progress.goal}
                aria-valuenow={Math.min(progress.goal, progress.posted + progress.scheduled)}
                className="relative h-1.5 w-24 overflow-hidden rounded-full bg-muted"
              >
                <span className="absolute inset-y-0 left-0 bg-success" style={{ width: `${(100 * Math.min(progress.goal, progress.posted)) / progress.goal}%` }} />
                <span
                  className="absolute inset-y-0 bg-primary"
                  style={{
                    left: `${(100 * Math.min(progress.goal, progress.posted)) / progress.goal}%`,
                    width: `${(100 * Math.max(0, Math.min(progress.goal, progress.posted + progress.scheduled) - progress.posted)) / progress.goal}%`,
                  }}
                />
              </span>
              <span>{progress.toDo > 0 ? `${progress.toDo} to go` : "goal met"}</span>
              {progress.toDo > 0 && (
                <Link
                  to={nextSlotThisWeek ? `/generate?day=${nextSlotThisWeek.date}&time=${nextSlotThisWeek.time}` : "/generate"}
                  className="-my-2 py-2 font-semibold text-primary hover:underline [@media(pointer:coarse)]:my-0 [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center"
                >
                  {nextSlotThisWeek ? `Write for ${dayLabel(nextSlotThisWeek.date)}, ${timeLabel(nextSlotThisWeek.time)}` : "Write a post"}
                </Link>
              )}
            </div>
          )}
          {showsBiz(profileName) && slots.length === 0 && userId && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>No posting times yet. Make them:</span>
              {[3, 5, 7].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => makeSlots(n)}
                  className="h-9 rounded-md border border-border/70 px-2.5 font-semibold text-foreground hover:border-primary/40 sm:h-8 [@media(pointer:coarse)]:h-11"
                >
                  {n} a week
                </button>
              ))}
            </div>
          )}
          {runningOut.length > 0 && (
            <ul className="space-y-1" aria-label={`Running out in the next ${COVER_DAYS / 7} weeks`}>
              {runningOut.map((r) => {
                const mine = businessKey(r.business) === businessKey(profileName);
                return (
                  <li key={r.business} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{bizName(r.business)}</span>
                    <span>{r.last ? `planned to ${dayLabel(r.last)}, then nothing` : `nothing planned in the next ${COVER_DAYS / 7} weeks`}</span>
                    {mine && (
                      <Link to="/generate" className="-my-2 py-2 font-semibold text-primary hover:underline [@media(pointer:coarse)]:my-0 [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center">
                        Write a post
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <div className={`grid gap-4 ${unscheduled.length > 0 || visibleWaiting.length > 0 ? "xl:grid-cols-[minmax(0,1fr)_15rem]" : ""}`}>
        {/* Unscheduled drafts and reels waiting on the board: a side column on wide screens, collapsible sections below that */}
        {(unscheduled.length > 0 || visibleWaiting.length > 0) && (
          <aside className="space-y-2 xl:order-last xl:sticky xl:top-4 xl:self-start xl:space-y-3">
            {unscheduled.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setPanelOpen((o) => !o)}
                  aria-expanded={panelOpen}
                  className="flex h-11 w-full items-center justify-between rounded-xl border border-border/70 bg-card px-4 text-sm font-semibold text-foreground shadow-card xl:hidden"
                >
                  Unscheduled drafts ({unscheduled.length})
                  <ChevronDown className={`h-4 w-4 transition-transform ${panelOpen ? "rotate-180" : ""}`} />
                </button>
                <div
                  className={`${panelOpen ? "mt-2" : "hidden"} space-y-2 rounded-xl border border-border/70 bg-card p-3 shadow-card xl:mt-0 xl:block`}
                >
                  <p className="hidden items-center gap-1 text-sm font-semibold text-foreground xl:flex">
                    Unscheduled drafts ({unscheduled.length})
                    <InfoTip label="About unscheduled drafts">Drag one onto a day, or pick its date.</InfoTip>
                  </p>
                  <div className="max-h-[60vh] space-y-2 overflow-y-auto">
                    {unscheduled.map((d) => (
                      <div
                        key={d.id}
                        {...dragProps(d.id)}
                        className={`cursor-grab rounded-lg border border-border/60 bg-background p-2 active:cursor-grabbing ${
                          dragging === d.id ? "opacity-40" : ""
                        }`}
                      >
                        <p className="line-clamp-2 text-xs font-medium text-foreground">{titleOf(d)}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{PLATFORM_LABEL[d.platform] ?? d.platform}</p>
                        {(() => {
                          const next = userId ? suggestPostingTime(getTrackedPosts(userId), d.platform, taken, new Date(), slots) : null;
                          return next ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => reschedule(d.id, next.at)}
                              className="mt-1.5 h-auto min-h-9 w-full justify-start whitespace-normal px-2 py-1.5 text-left text-[11px] sm:min-h-8 [@media(pointer:coarse)]:min-h-11"
                            >
                              {next.why === "slot" ? "Next slot" : "Best time"}: {whenLabel(next.at)}
                            </Button>
                          ) : null;
                        })()}
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const pick = rowPick[d.id];
                            if (pick?.date) reschedule(d.id, scheduleAt(pick.date, pick.time));
                          }}
                          className="mt-1.5 flex flex-wrap items-center gap-1.5"
                        >
                          <DayInput
                            min={todayKey}
                            value={rowPick[d.id]?.date ?? ""}
                            aria-label={`Date for ${titleOf(d)}`}
                            onPick={(day) => setPick(d.id, { date: day })}
                            className={`${dateInputClass} min-w-[8rem] flex-1`}
                          />
                          <input
                            type="time"
                            value={rowPick[d.id]?.time ?? ""}
                            onChange={(e) => setPick(d.id, { time: e.target.value })}
                            aria-label={`Time for ${titleOf(d)} (optional)`}
                            title="Time (optional)"
                            className={`${dateInputClass} w-24`}
                          />
                          <Button type="submit" size="sm" disabled={!rowPick[d.id]?.date} className="h-9 px-3 text-xs sm:h-8 [@media(pointer:coarse)]:h-11">
                            Schedule
                          </Button>
                        </form>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {visibleWaiting.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setWaitOpen((o) => !o)}
                  aria-expanded={waitOpen}
                  className="flex h-11 w-full items-center justify-between rounded-xl border border-border/70 bg-card px-4 text-sm font-semibold text-foreground shadow-card xl:hidden"
                >
                  Waiting on the posts board ({visibleWaiting.length})
                  <ChevronDown className={`h-4 w-4 transition-transform ${waitOpen ? "rotate-180" : ""}`} />
                </button>
                <div className={`${waitOpen ? "mt-2" : "hidden"} space-y-3 rounded-xl border border-border/70 bg-card p-3 shadow-card xl:mt-0 xl:block`}>
                  <p className="hidden items-center gap-1 text-sm font-semibold text-foreground xl:flex">
                    <Clapperboard className="h-4 w-4 text-brand" aria-hidden />
                    Waiting on the posts board ({visibleWaiting.length})
                    <InfoTip label="About posts waiting on the posts board">Approve a post on the posts board to give it a date.</InfoTip>
                  </p>
                  <div className="max-h-[50vh] space-y-3 overflow-y-auto">
                    {waitingGroups.map((g) => (
                      <div key={g.business} className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          {g.business} · {g.items.length}
                        </p>
                        {g.items.slice(0, 3).map((w) => (
                          <Link
                            key={w.id}
                            to={links.reels({ card: w.id, brand: w.brand })}
                            className="block rounded-md px-1.5 py-1.5 text-xs text-foreground hover:bg-muted/60 [@media(pointer:coarse)]:py-2.5"
                          >
                            <span className="line-clamp-2">{w.title}</span>
                            {(w.carousel || w.changes) && (
                              <span className="text-[10px] font-semibold text-muted-foreground">
                                {w.carousel && "Carousel"}
                                {w.carousel && w.changes && " · "}
                                {w.changes && <span className="text-warning">Needs changes</span>}
                              </span>
                            )}
                          </Link>
                        ))}
                        {g.items.length > 3 && (
                          <Link
                            to={groupHref(g)}
                            className="block px-1.5 py-1 text-[11px] font-semibold text-primary hover:underline [@media(pointer:coarse)]:py-2.5"
                          >
                            +{g.items.length - 3} more on the board
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </aside>
        )}

        <div className="min-w-0 space-y-3">
          {noteForm && (
            <div ref={noteRef} className="space-y-2 rounded-xl border border-border/70 bg-card p-3 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{noteForm.id ? "Edit note" : "Add a note"}</p>
                <button
                  type="button"
                  onClick={() => setNoteForm(null)}
                  aria-label="Close note"
                  className="-mr-1 grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitNote();
                }}
                className="flex flex-wrap items-center gap-2"
              >
                <input
                  type="date"
                  value={noteForm.date}
                  onChange={(e) => e.target.value && setNoteForm({ ...noteForm, date: e.target.value })}
                  aria-label="Note date"
                  className={dateInputClass}
                />
                <input
                  autoFocus
                  value={noteForm.title}
                  onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
                  maxLength={80}
                  placeholder="Campaign or reminder"
                  aria-label="Note"
                  className="h-9 min-w-0 flex-1 basis-48 rounded-md border border-input bg-background px-3 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 [@media(pointer:coarse)]:h-11"
                />
                <div role="radiogroup" aria-label="Colour" className="flex">
                  {NOTE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={noteForm.color === c}
                      aria-label={NOTE_COLOR_NAME[c]}
                      onClick={() => setNoteForm({ ...noteForm, color: c })}
                      className="grid h-9 w-9 place-items-center rounded-full sm:h-8 sm:w-8 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                    >
                      <span
                        className={`h-5 w-5 rounded-full ${NOTE_SWATCH[c]} ${
                          noteForm.color === c ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex gap-2">
                  {noteForm.id && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeNote(noteForm.id!)}
                      className="h-9 px-3 text-xs text-destructive hover:text-destructive sm:h-8 [@media(pointer:coarse)]:h-11"
                    >
                      Delete
                    </Button>
                  )}
                  <Button type="submit" size="sm" disabled={!noteForm.title.trim()} className="h-9 px-3 text-xs sm:h-8 [@media(pointer:coarse)]:h-11">
                    {noteForm.id ? "Save" : "Add note"}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {dayOpen && view !== "upcoming" && dayPanel(dayOpen)}

          {selected && view !== "upcoming" && (
            <div ref={editorRef} className={view === "week" ? "hidden sm:block" : ""}>
              {editor(selected)}
            </div>
          )}

          {overdue.length > 0 && (
            <section id="overdue" aria-label="Overdue posts" className="scroll-mt-4 space-y-2 rounded-xl border border-warning/40 bg-warning/5 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <CalendarClock className="h-4 w-4 text-warning" />
                {dueHeading(overdue.length, overdue.length)}
              </p>
              {overdue.map((d) => postRow(d, d.scheduledFor!.slice(0, 10)))}
            </section>
          )}

          {view === "month" && (
            <Card className="overflow-hidden border-border/60 shadow-card">
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Month calendar">
                {/* Phones fit all 7 days with dots; from sm up each day lists its items. */}
                <div className="sm:min-w-[620px]">
                  <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {WEEKDAYS.map((w) => (
                      <div key={w} className="py-2">
                        {w}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {grid.map((key) => {
                      const day = keyToDate(key);
                      const inMonth = day.getMonth() === anchorDate.getMonth();
                      const isToday = key === todayKey;
                      const t = dayThings(key);
                      // Posts, repeats, reels, channel and team posts share the 3 places; the rest opens the day.
                      const items = [
                        ...t.events.map((e) => () => chip(e, false)),
                        ...t.ghosts.map((g) => () => ghostChip(g, key, false)),
                        ...t.reels.map((r) => () => reelChip(r, false)),
                        ...t.feed.map((f) => () => feedChip(f, false)),
                        ...t.team.map((p) => () => teamChip(p, false)),
                        ...t.slots.map((time) => () => slotChip(key, time, false)),
                      ];
                      const dots = dayDots(key);
                      return (
                        <div
                          key={key}
                          data-day={key}
                          {...dropProps(key)}
                          onClick={cellClick(key)}
                          className={`min-h-[56px] cursor-pointer border-b border-r border-border/50 p-1 sm:min-h-[84px] sm:p-1.5 ${
                            inMonth ? "bg-card" : "bg-muted/20"
                          } ${dayOpen === key ? "ring-2 ring-inset ring-primary/60" : ""} ${dropHighlight(key)}`}
                        >
                          {dayNumber(
                            key,
                            `mb-1 flex h-7 w-7 items-center justify-center rounded-full text-[11px] sm:h-5 sm:w-5 ${
                              isToday
                                ? "bg-primary font-bold text-primary-foreground"
                                : inMonth
                                  ? "text-foreground"
                                  : "text-muted-foreground"
                            }`,
                          )}
                          <div className="flex flex-wrap gap-1 px-0.5 sm:hidden" aria-hidden>
                            {dots.slice(0, 6).map((d) => (
                              <span key={d.id} className={`h-1.5 w-1.5 rounded-full ${d.tone}`} />
                            ))}
                            {dots.length > 6 && <span className="text-[9px] leading-none text-muted-foreground">+{dots.length - 6}</span>}
                          </div>
                          <div className="hidden space-y-1 sm:block">
                            {(keyDates.get(key) ?? []).map((k) => keyDateLine(k, false))}
                            {(notesByDate.get(key) ?? []).map((n) => noteChip(n, false))}
                            {items.slice(0, 3).map((render) => render())}
                            {items.length > 3 && (
                              <button
                                type="button"
                                onClick={() => openDay(key)}
                                className="px-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                              >
                                +{items.length - 3} more
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              {monthLegend.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground" aria-label="What the colours mean">
                  {monthLegend.map((l) => (
                    <span key={l.label} className="inline-flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${l.tone}`} aria-hidden />
                      {l.label}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          )}

          {view === "week" && (
            <Card className="overflow-hidden border-border/60 shadow-card">
              <div className="grid sm:grid-cols-7">
                {week.map((key) => {
                  const isToday = key === todayKey;
                  const events = byDate.get(key) ?? [];
                  const dayReels = visibleReels.filter((r) => r.date === key);
                  return (
                    <div
                      key={key}
                      data-day={key}
                      {...dropProps(key)}
                      onClick={cellClick(key)}
                      className={`flex cursor-pointer gap-3 border-b border-border/50 p-2 sm:min-h-[220px] sm:flex-col sm:gap-1.5 sm:border-r ${
                        key < todayKey ? "bg-muted/20" : "bg-card"
                      } ${dayOpen === key ? "ring-2 ring-inset ring-primary/60" : ""} ${dropHighlight(key)}`}
                    >
                      <div className="w-12 shrink-0 text-center sm:w-auto sm:text-left">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {keyToDate(key).toLocaleDateString(undefined, { weekday: "short" })}
                        </div>
                        {dayNumber(
                          key,
                          `mx-auto mt-0.5 grid h-9 w-9 place-items-center rounded-full text-sm sm:mx-0 sm:h-7 sm:w-7 ${
                            isToday ? "bg-primary font-bold text-primary-foreground" : "text-foreground"
                          }`,
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        {(keyDates.get(key) ?? []).map((k) => keyDateLine(k, true))}
                        {(notesByDate.get(key) ?? []).map((n) => noteChip(n, true))}
                        {events.map((e) => (
                          <div key={e.id} className="space-y-1.5">
                            {chip(e, true)}
                            {selectedId === e.id && !selectedGhost && <div className="sm:hidden">{editor(e)}</div>}
                          </div>
                        ))}
                        {(ghostsByDate.get(key) ?? []).map((g) => (
                          <div key={`${g.id}@${key}`} className="space-y-1.5">
                            {ghostChip(g, key, true)}
                            {selectedId === g.id && selectedGhost === key && <div className="sm:hidden">{editor(g)}</div>}
                          </div>
                        ))}
                        {dayReels.map((r) => reelChip(r, true))}
                        {visibleFeed.filter((f) => f.date === key).map((f) => feedChip(f, true))}
                        {(teamByDate.get(key) ?? []).map((p) => teamChip(p, true))}
                        {key >= todayKey && slotsOn && (slotsByDate.get(key) ?? []).map((time) => slotChip(key, time, true))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {view === "upcoming" && (
            <div className="space-y-2">
              {upcoming.length === 0 && overdue.length === 0 && !listItems.some((i) => i.kind === "reel" || i.kind === "feed" || i.kind === "team") && (
                <Card className="border-border/60 shadow-card">
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    {platform === "all" && status === "all" ? "Nothing scheduled yet." : "Nothing matches these filters."}
                    {unscheduled.length === 0 && platform === "all" && status === "all" && (
                      <Button asChild size="sm" className="mx-auto mt-3 flex w-fit">
                        <Link to="/generate">Write a post</Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
              {listItems.map((i) => {
                if (i.kind === "key")
                  return (
                    <div key={`k${i.date}${i.item.title}`} className="flex items-center gap-3 px-3 py-1">
                      <span className="w-14 shrink-0 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        {shortDay(i.date)}
                      </span>
                      <span className="min-w-0 flex-1">{keyDateLine(i.item, true)}</span>
                    </div>
                  );
                if (i.kind === "note")
                  return (
                    <div key={i.item.id} className="flex items-center gap-3 px-3 py-0.5">
                      <span className="w-14 shrink-0 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        {shortDay(i.date)}
                      </span>
                      <span className="min-w-0 flex-1">{noteChip(i.item, true)}</span>
                    </div>
                  );
                if (i.kind === "team")
                  return (
                    <div key={`team-${i.item.id}`} className="flex items-center gap-3 px-3 py-0.5">
                      <span className="w-14 shrink-0 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        {shortDay(i.date)}
                      </span>
                      <span className="min-w-0 flex-1">{teamChip(i.item, true)}</span>
                    </div>
                  );
                if (i.kind === "slot")
                  return (
                    <Link
                      key={`slot-${i.date}-${i.item}`}
                      to={`/generate?day=${i.date}&time=${i.item}`}
                      className="flex w-full items-center gap-3 rounded-xl border border-dashed border-muted-foreground/40 bg-card/50 p-3 text-left hover:border-primary"
                    >
                      {dateBadge(i.date)}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-muted-foreground">Open slot · {timeLabel(i.item)}</p>
                        <p className="text-xs font-semibold text-primary">Write for this slot</p>
                      </div>
                    </Link>
                  );
                if (i.kind === "ghost")
                  return (
                    <div key={`${i.item.id}@${i.date}`} className="flex items-center gap-3 px-3 py-0.5">
                      <span className="w-14 shrink-0 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        {shortDay(i.date)}
                      </span>
                      <span
                        title={`Repeats ${REPEAT_LABEL[i.item.repeat!.every]}`}
                        className="min-w-0 flex-1 truncate rounded border border-dashed border-primary/50 px-1.5 py-1.5 text-xs font-medium text-primary"
                      >
                        <RepeatIcon className="mr-1 inline h-3 w-3 align-[-2px]" aria-label="Repeats" />
                        {titleOf(i.item)}
                      </span>
                      <button
                        type="button"
                        onClick={() => skip(i.item, i.date)}
                        className="h-9 shrink-0 rounded-md px-2 text-xs font-semibold text-muted-foreground hover:text-foreground sm:h-8 [@media(pointer:coarse)]:h-11"
                      >
                        Skip
                      </button>
                    </div>
                  );
                if (i.kind === "reel") {
                  const r = i.item;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => navigate(r.href)}
                      className="flex w-full items-center gap-3 rounded-xl border border-brand/30 bg-card p-3 text-left shadow-card"
                    >
                      {dateBadge(r.date)}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.business} · Reel{r.time && ` · ${timeLabel(r.time)}`} ·{" "}
                          <span className={r.auto ? "" : "font-medium text-warning"}>{reelHow(r)}</span>
                        </p>
                      </div>
                    </button>
                  );
                }
                if (i.kind === "feed") {
                  const f = i.item;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => openFeedItem(f.id)}
                      className="flex w-full items-center gap-3 rounded-xl border border-sky-500/30 bg-card p-3 text-left shadow-card"
                    >
                      {dateBadge(f.date)}
                      {f.media[0] && <img src={f.media[0]} alt="" loading="lazy" className="h-14 w-11 shrink-0 rounded-md border border-border/60 object-cover" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{f.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {f.business} · {f.channel}
                          {f.time && ` · ${timeLabel(f.time)}`} · {STATUS_LABEL[f.status]}
                          {f.media.length > 1 && ` · ${f.media.length} pictures`}
                        </p>
                      </div>
                    </button>
                  );
                }
                return postRow(i.item, i.date);
              })}
            </div>
          )}
        </div>
      </div>
      <ChannelPostDrawer item={openFeed} onClose={closeFeed} />
      {teamOpen && userId && (
        <TeamPostPanel
          key={teamOpen.id}
          uid={userId}
          post={teamOpen}
          reviews={teamReviews}
          onReviews={setTeamReviews}
          onClose={closeTeam}
        />
      )}
    </div>
  );
}
