import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useNavigationType, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProfileSwitcher from "@/components/ProfileSwitcher";
import ExportPill from "@/components/ExportPill";
import { stopCloudSync } from "@/lib/cloudSync";
import { disablePushHere, refreshPushHere } from "@/lib/notify";
import { checkMarketEnabled, forgetMarketShown, marketShown } from "@/lib/market";
import { checkSocialConnect, forgetSocialConnect, socialConnectShown } from "@/lib/socialConnect";
import { checkMe, fetchBoard, forgetMe, ownerShown, reelsShown, seesBoard, sharedBoard, waitsOnMe } from "@/lib/reelsBoard";
import { activeProfile, applyBrandLink, profileForBusiness, rememberUser } from "@/lib/profiles";
import { supabase } from "@/lib/supabase";
import { useLeoUser } from "@/lib/useLeoOnly";
import { setActivityOn } from "@/lib/activity";
import { AssistantMount } from "@/components/feedback/AssistantMount";
import TourPopover from "@/components/TourPopover";
import JumpTo, { jumpShortcut } from "@/components/JumpTo";
import { pushRecent } from "@/lib/jumpTo";
import { badgeText, boardWaitingHere, countNeedsYou, onBoardWaiting } from "@/lib/needsYou";
import { loadDrafts, onDraftsChanged } from "@/lib/draftHistory";
import { useZernioOutbox } from "@/lib/useZernioOutbox";
import { readTeamPosts, readTeamReviews, teamPostsHere } from "@/lib/teamPosts";
import { localDateKey } from "@/lib/dueDates";
import { sgDay } from "@/lib/goals";
import { ChevronUp, LayoutGrid, LogOut, MessageSquarePlus, Moon, Plus, Search, Settings, Sparkles, Star, Sun, X } from "lucide-react";
import { feedbackIsNew } from "@/components/feedback/config";
import SectionTabs from "@/components/SectionTabs";
import { links } from "@/lib/links";
import { applyTheme, readTheme, saveTheme, type Theme } from "@/lib/theme";
import {
  SECTIONS,
  mobileTabs,
  moreSheet,
  pageTitle,
  section,
  sectionFor,
  visiblePages,
  type MoreTile,
  type NavSection,
} from "@/lib/nav";

// One sidebar on desktop, after Fastlane (docs/fastlane-nav-gap.md): the sections, the agent's chat button and chats,
// then Brand, Learn, Feedback and the account at the foot. The open section's pages are tabs at the top of the page
// (SectionTabs). Phones keep a bottom bar and a More sheet. Every page is listed once, in src/lib/nav.ts.
const MAIN_SECTIONS = SECTIONS.filter((s) => !s.foot);
// The agent's chats (Leo only) load in their own chunk, like the agent page.
const SidebarThreads = lazy(() => import("@/components/agent/SidebarThreads"));
const AgentMeter = lazy(() => import("@/components/agent/AgentMeter"));

// The Remix sheet and its pill (north star, Leo only) read the data drops, so they load in their own chunk,
// fetched as soon as the session says Leo so the sheet still opens within 400ms.
const loadRemixSheet = () => import("@/components/remix/RemixSheet");
const loadRemixPill = () => import("@/components/remix/RemixPill");
const RemixSheet = lazy(loadRemixSheet);
const RemixPill = lazy(loadRemixPill);
// Activity's recorder (Leo only) listens to every job store, so it loads in its own chunk too.
const ActivityRecorder = lazy(() => import("@/components/ActivityRecorder"));

function Logo() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-elegant">
      <Sparkles className="h-4 w-4" />
    </span>
  );
}

function Brandmark() {
  return (
    <Link to="/home" className="flex min-h-11 items-center gap-2.5">
      <Logo />
      <span className="flex flex-col leading-none">
        <span className="text-sm font-bold tracking-tight text-foreground">
          Content Studio
        </span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          for advisors
        </span>
      </span>
    </Link>
  );
}

/**
 * Shown while a lazy route chunk loads. A shaped skeleton reads as "the page is
 * coming" where a bare "Loading…" reads as a broken screen.
 */
function RouteSkeleton() {
  return (
    <div className="animate-pulse space-y-6 py-2" aria-busy="true" aria-label="Loading page">
      <div className="space-y-2.5">
        <div className="h-7 w-1/3 rounded-lg bg-muted" />
        <div className="h-4 w-2/3 rounded bg-muted/70" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-24 rounded-xl bg-muted/70" />
        <div className="h-24 rounded-xl bg-muted/70" />
        <div className="h-24 rounded-xl bg-muted/70" />
      </div>
      <div className="h-48 rounded-xl bg-muted/50" />
    </div>
  );
}

/**
 * A new page starts at the top; Back and Forward return to where you were.
 * Filter changes on the same page leave the scroll alone.
 */
function useScrollMemory() {
  const { pathname, key } = useLocation();
  const navType = useNavigationType();
  const saved = useRef(new Map<string, number>());
  const current = useRef({ key, pathname });

  useEffect(() => {
    window.history.scrollRestoration = "manual";
    const onScroll = () => saved.current.set(current.current.key, window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    const samePage = current.current.pathname === pathname;
    current.current = { key, pathname };
    if (navType !== "POP") {
      if (!samePage) window.scrollTo(0, 0);
      return;
    }
    const y = saved.current.get(key);
    if (y === undefined) return;
    // The page may still be loading its chunk or data: wait until it is tall enough.
    const started = performance.now();
    let frame = 0;
    const restore = () => {
      const room = document.documentElement.scrollHeight - window.innerHeight;
      if (room >= y || performance.now() - started > 1500) window.scrollTo(0, y);
      else frame = requestAnimationFrame(restore);
    };
    restore();
    return () => cancelAnimationFrame(frame);
  }, [key, pathname, navType]);
}

function SideLink({ s, to, active, count = 0 }: { s: NavSection; to: string; active: boolean; count?: number }) {
  const Icon = s.icon;
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-9 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11 ${
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{s.label}</span>
      {count > 0 && (
        <>
          <span aria-hidden className="flex items-center gap-1 text-xs font-semibold tabular-nums text-warning">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" />
            {badgeText(count)}
          </span>
          <span className="sr-only">, {count} need you</span>
        </>
      )}
    </Link>
  );
}

/** Brand, Learn and Feedback: the sidebar's foot buttons. */
function FootLink({ s, to, active, wide = false }: { s: NavSection; to: string; active: boolean; wide?: boolean }) {
  const isNew = s.id === "feedback" && feedbackIsNew();
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-9 items-center rounded-lg border px-3 text-sm font-medium transition-colors [@media(pointer:coarse)]:min-h-11 ${
        wide ? "justify-start" : "justify-center"
      } ${active ? "border-primary/40 bg-primary/10 text-primary" : "border-border/70 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
    >
      {s.label}
      {isNew && (
        <>
          <span aria-hidden className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
          <span className="sr-only">, new</span>
        </>
      )}
    </Link>
  );
}

/** The account card at the foot: who is signed in, with Settings and Sign out in its menu. */
/** The theme switch's words: what a tap turns it into. */
function ThemeSwitchLabel({ theme }: { theme: Theme }) {
  return theme === "dark" ? (
    <>
      <Sun className="h-4 w-4 text-muted-foreground" /> Light mode
    </>
  ) : (
    <>
      <Moon className="h-4 w-4 text-muted-foreground" /> Dark mode
    </>
  );
}

function AccountMenu({
  email,
  settingsTo,
  northStar,
  active,
  theme,
  onTheme,
  onSignOut,
}: {
  email: string;
  settingsTo: string;
  northStar: boolean;
  active: boolean;
  theme: Theme;
  onTheme: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const item = "flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm text-foreground hover:bg-accent [@media(pointer:coarse)]:min-h-11";
  return (
    <div ref={ref} className="relative">
      {open && (
        <div role="menu" aria-label="Account" onClick={() => setOpen(false)} className="absolute inset-x-0 bottom-full z-40 mb-2 rounded-xl border border-border bg-popover p-1 shadow-lg">
          {northStar && (
            <Link role="menuitem" to="/north-star" className={item}>
              <Star className="h-4 w-4 text-muted-foreground" /> North star
            </Link>
          )}
          <Link role="menuitem" to={settingsTo} className={item}>
            <Settings className="h-4 w-4 text-muted-foreground" /> Settings
          </Link>
          <button role="menuitem" type="button" onClick={onTheme} className={item}>
            <ThemeSwitchLabel theme={theme} />
          </button>
          <button role="menuitem" type="button" onClick={onSignOut} className={item}>
            <LogOut className="h-4 w-4 text-muted-foreground" /> Sign out
          </button>
        </div>
      )}
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors [@media(pointer:coarse)]:min-h-11 ${
          active ? "border-primary/40 bg-primary/10" : "border-border/70 bg-background hover:border-primary/40"
        }`}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-primary text-sm font-semibold uppercase text-primary-foreground">
          {email.charAt(0) || "?"}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={email}>
          {email || "Account"}
        </span>
        <ChevronUp className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "rotate-180"}`} />
      </button>
    </div>
  );
}

function MoreTileLink({ tile, active }: { tile: MoreTile; active: boolean }) {
  const Icon = tile.icon;
  return (
    <Link
      to={tile.to}
      aria-current={active ? "true" : undefined}
      className={`flex min-h-11 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/70 bg-card text-foreground hover:border-primary/40"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {tile.label}
      {tile.sectionId === "feedback" && feedbackIsNew() && (
        <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">New</span>
      )}
    </Link>
  );
}

export default function StudioLayout() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  // Jump to: Cmd/Ctrl+K anywhere, the button under New post, or the search button on phones.
  const [jumpOpen, setJumpOpen] = useState(false);
  const [email, setEmail] = useState<string>("");
  const [uid, setUid] = useState<string | null>(null);
  // Overdue posts and team posts waiting for approval: part of the count on Home and the phone Home tab.
  const [needsYou, setNeedsYou] = useState(0);
  // Posts in Review or Needs changes on the posts board: the rest of Home's count.
  const [boardWaiting, setBoardWaiting] = useState(0);
  // Social accounts sits in the nav only once the server has said it is on for this sign-in.
  const [, setSocialOn] = useState(socialConnectShown);
  const [, setReelsOn] = useState(reelsShown);
  const [, setMarketOn] = useState(marketShown);
  const mainRef = useRef<HTMLElement>(null);
  const moreRef = useRef<HTMLDialogElement>(null);
  const prevPath = useRef(pathname);
  // Read on every render: setReelsOn rerenders once checkMe has stored the answer.
  const board = reelsShown();
  // Each sidebar item reopens the page you last had open in its section.
  const lastInSection = useRef<Record<string, string>>({});

  const here = sectionFor(pathname);
  // only a page this sign-in can open, so a typed owner-only address never becomes where the item lands
  if (here && visiblePages(here.pages, email).some((p) => pathname === p.to || pathname.startsWith(p.to + "/"))) lastInSection.current[here.id] = pathname + search;

  useScrollMemory();
  // Moves and cancels of auto-posts, sent to Zernio for every sign-in that can auto-post (publish-calendar)
  useZernioOutbox(uid);

  // Dark unless this device chose light; public pages outside this shell go back to light (src/lib/theme.ts).
  const [theme, setTheme] = useState<Theme>(readTheme);
  useLayoutEffect(() => {
    applyTheme(theme);
    return () => applyTheme(null);
  }, [theme]);
  const switchTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    saveTheme(next);
    setTheme(next);
  };

  const leo = useLeoUser();
  // Activity logs for Leo's sessions only. Set while drawing, before any page below reads its drafts (a Claude
  // draft absorbed on the first read logs then, and its sync row is gone after).
  setActivityOn(!!leo);
  const [searchParams, setSearchParams] = useSearchParams();
  const remixKey = searchParams.get("remix");
  // A typed ?remix= on anyone else's session is dropped; while the session is still being read (undefined) it
  // stays, so Leo's sheet reopens after a reload. Plain params here: urlState and links stay out of the main chunk.
  useEffect(() => {
    if (leo !== null || !remixKey) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("remix");
        return next;
      },
      { replace: true },
    );
  }, [leo, remixKey, setSearchParams]);
  useEffect(() => {
    if (!leo) return;
    void loadRemixSheet();
    void loadRemixPill();
  }, [leo]);

  // Leo's plans (north star phase 5): his autopilot posts waiting for an OK join the Pipeline count, and autopilot and
  // today's ideas run once on load, each doing nothing (and spending nothing) until he has turned it on. Loaded for
  // Leo only, so none of it reaches anyone else's session or the main chunk.
  const leoId = leo?.id;
  const [autopilot, setAutopilot] = useState<{ waiting: (id: string) => number; on: (cb: () => void) => () => void } | null>(null);
  useEffect(() => {
    if (!leoId) return;
    let active = true;
    void Promise.all([import("@/lib/autopilot"), import("@/lib/autopilotJob"), import("@/lib/ideasInbox")]).then(
      ([ap, job, ideas]) => {
        if (!active) return; // React's dev double mount: only the second load runs
        setAutopilot({ waiting: (id) => ap.autopilotWaiting(id, sgDay()), on: job.onAutopilot });
        void job.runAutopilot(leoId).catch(() => {}); // its card shows the run's error
        ideas.startMorning(leoId);
      },
      () => {}, // a chunk gone after a deploy: no runs, and the count leaves autopilot out until the next load
    );
    return () => {
      active = false;
    };
  }, [leoId]);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? "");
      if (active) setUid(data.user?.id ?? null);
      if (active && data.user) {
        rememberUser(data.user.id);
        // a link that names a brand (?profile=, or ?business= by name) opens on it (docs/brand-isolation.md)
        const sp = new URLSearchParams(window.location.search);
        const brandLink = applyBrandLink(data.user.id, sp.get("profile") ?? profileForBusiness(data.user.id, sp.get("business")));
        if (brandLink === "reload") return window.location.reload();
        if (brandLink === "drop") {
          const u = new URL(window.location.href);
          u.searchParams.delete("profile");
          navigate(u.pathname + u.search + u.hash, { replace: true });
        }
      }
      if (active && data.user) void refreshPushHere();
      if (active && data.user) void checkSocialConnect().then((on) => active && setSocialOn(on));
      if (active && data.user) void checkMe().then((m) => active && setReelsOn(seesBoard(m))).catch(() => {});
      if (active && data.user) void checkMarketEnabled().then((on) => active && setMarketOn(on));
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setJumpOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Counted from what this device holds, again on every page change, tab return and half minute (and, for Leo, on
  // every autopilot change).
  useEffect(() => {
    if (!uid) return;
    const recount = () =>
      setNeedsYou(countNeedsYou(loadDrafts(uid), teamPostsHere(uid, readTeamPosts(uid)), readTeamReviews(uid), localDateKey(), autopilot?.waiting(uid)));
    recount();
    const timer = window.setInterval(recount, 30_000);
    const onVisible = () => document.visibilityState === "visible" && recount();
    document.addEventListener("visibilitychange", onVisible);
    const off = onDraftsChanged(recount);
    const offAutopilot = autopilot?.on(recount);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      off();
      offAutopilot?.();
    };
  }, [uid, pathname, autopilot]);

  // One team-board call on load (shared with Home) and on tab return (not on the timer), for board users only;
  // the board page sends its own count after every change.
  useEffect(() => {
    if (!board || !uid || !waitsOnMe()) return setBoardWaiting(0);
    let active = true;
    const refresh = (fresh = false) =>
      void (fresh ? fetchBoard() : sharedBoard()).then((b) => active && setBoardWaiting(boardWaitingHere(b.cards, ownerShown(), activeProfile(uid).boardBrand)), () => {});
    refresh();
    const onVisible = () => document.visibilityState === "visible" && refresh(true);
    document.addEventListener("visibilitychange", onVisible);
    const off = onBoardWaiting(setBoardWaiting);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      off();
    };
  }, [board, uid]);

  // Jump to lists the pages opened lately on this device.
  useEffect(() => {
    pushRecent(pathname);
  }, [pathname]);

  // Pages that know a better name (a creator, a 404) set theirs in an effect,
  // which runs after this one.
  useLayoutEffect(() => {
    document.title = pageTitle(pathname);
  }, [pathname]);

  useEffect(() => {
    if (prevPath.current === pathname) return;
    prevPath.current = pathname;
    // After a nav click, move focus to the new page so keyboard and screen
    // reader users land on it, not back in the menu. A page that focused its
    // own field keeps it.
    const el = document.activeElement;
    const fromMenu = !el || el === document.body || !!el.closest("[data-nav]");
    // Close the sheet first: closing hands focus back to the More button.
    moreRef.current?.close();
    setMoreOpen(false);
    if (fromMenu) mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  // The More sheet is a native modal dialog: it traps focus, closes on
  // Escape and hands focus back to the More button.
  useEffect(() => {
    const d = moreRef.current;
    if (!d) return;
    if (moreOpen && !d.open) d.showModal();
    if (!moreOpen && d.open) d.close();
  }, [moreOpen]);

  const handleSignOut = async () => {
    // Send unsaved changes first, then load /auth fresh so whoever signs in
    // next on this browser starts with a clean app and their own sync.
    // Phone alerts carry post titles: stop them on this browser while still signed in.
    await Promise.race([disablePushHere().catch(() => undefined), new Promise((r) => setTimeout(r, 2_000))]);
    await stopCloudSync();
    forgetSocialConnect();
    forgetMarketShown();
    forgetMe();
    await supabase.auth.signOut();
    window.location.replace("/auth");
  };

  // Home lists everything that needs you (overdue posts, team posts, the posts board), so Home carries the count.
  const homeCount = needsYou + boardWaiting;
  const sectionTo = (s: NavSection) => lastInSection.current[s.id] ?? visiblePages(s.pages, email)[0]?.to ?? s.to;

  const tabs = mobileTabs();
  const moreActive = !tabs.some((t) => t.active(pathname));
  const sheet = moreSheet(email);
  const tileActive = (t: MoreTile) => here?.id === t.sectionId;

  return (
    <div className="min-h-screen bg-canvas lg:bg-rail">
      <a
        href="#main-content"
        className="sr-only z-50 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* Desktop: one sidebar, its own panel beside the page's */}
      <aside data-nav className="fixed inset-y-0 left-0 z-30 hidden w-[var(--nav-w)] p-2.5 pr-0 lg:flex">
        <div className="flex min-h-0 w-full flex-col rounded-2xl border border-border/70 bg-sidebar">
          <div className="flex items-center gap-2 px-3 pt-3">
            <Link to="/home" aria-label="Content Studio home" title="Content Studio" className="shrink-0 rounded-xl">
              <Logo />
            </Link>
            <div className="min-w-0 flex-1">
              <ProfileSwitcher />
            </div>
          </div>
          <nav aria-label="Sections" className="space-y-0.5 px-3 pt-4">
            {MAIN_SECTIONS.filter((s) => visiblePages(s.pages, email).length > 0).map((s) => (
              <SideLink key={s.id} s={s} to={sectionTo(s)} active={here?.id === s.id} count={s.id === "home" ? homeCount : 0} />
            ))}
          </nav>
          <div className="space-y-2 px-3 pt-4">
            <Button
              asChild
              className="h-auto min-h-10 w-full justify-start gap-2 whitespace-normal py-2 text-left bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95 [@media(pointer:coarse)]:min-h-11"
            >
              {leo ? (
                <Link to={links.agent()}>
                  <MessageSquarePlus className="h-4 w-4" /> Start a chat with the agent
                </Link>
              ) : (
                <Link to="/generate">
                  <Plus className="h-4 w-4" /> New post
                </Link>
              )}
            </Button>
            <button
              type="button"
              onClick={() => setJumpOpen(true)}
              aria-haspopup="dialog"
              aria-keyshortcuts="Meta+K Control+K"
              className="flex h-9 w-full items-center gap-2 rounded-lg border border-border/70 bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground [@media(pointer:coarse)]:h-11"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">Jump to...</span>
              <kbd className="rounded border border-border/70 px-1.5 font-sans text-[10px] font-semibold">{jumpShortcut()}</kbd>
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col px-3 pt-1">
            {leo && (
              <ErrorBoundary>
                <Suspense fallback={null}>
                  <SidebarThreads userId={leo.id} />
                </Suspense>
              </ErrorBoundary>
            )}
          </div>
          <div className="space-y-2 border-t border-border/70 p-3">
            <FootLink s={section("playbook")} to={sectionTo(section("playbook"))} active={here?.id === "playbook"} wide />
            <div className="grid grid-cols-2 gap-2">
              <FootLink s={section("learn")} to={sectionTo(section("learn"))} active={here?.id === "learn"} />
              <FootLink s={section("feedback")} to={sectionTo(section("feedback"))} active={here?.id === "feedback"} />
            </div>
            {leo && (
              <ErrorBoundary>
                <Suspense fallback={null}>
                  <AgentMeter />
                </Suspense>
              </ErrorBoundary>
            )}
            <AccountMenu
              email={email}
              settingsTo={sectionTo(section("settings"))}
              northStar={!!leo}
              active={here?.id === "settings" || pathname === "/north-star"}
              theme={theme}
              onTheme={switchTheme}
              onSignOut={handleSignOut}
            />
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-1.5">
          <Brandmark />
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setJumpOpen(true)}
              aria-label="Jump to a page"
              aria-haspopup="dialog"
              className="h-11 w-11 p-0 text-muted-foreground"
            >
              <Search className="h-5 w-5" />
            </Button>
            <ProfileSwitcher compact />
          </div>
        </div>
      </header>

      {/* Mobile "More" sheet. A click on the dialog itself is a click on the backdrop. */}
      <dialog
        ref={moreRef}
        aria-label="More pages"
        data-nav
        onClose={() => setMoreOpen(false)}
        onClick={(e) => e.target === e.currentTarget && setMoreOpen(false)}
        className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[80vh] w-full max-w-none rounded-t-2xl border-t border-border/70 bg-background p-0 shadow-xl backdrop:bg-foreground/40 lg:hidden"
      >
        <div className="p-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">More pages</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMoreOpen(false)}
              aria-label="Close"
              className="h-11 w-11 p-0 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {sheet.map((t) => (
              <MoreTileLink key={t.to} tile={t} active={tileActive(t)} />
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/70 pt-3">
            <p className="min-w-0 truncate text-xs text-muted-foreground" title={email}>
              {email}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="sm" onClick={switchTheme} className="h-11 gap-1.5 text-muted-foreground">
                <ThemeSwitchLabel theme={theme} />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="h-11 gap-1.5 text-muted-foreground">
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </Button>
            </div>
          </div>
        </div>
      </dialog>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Primary"
        data-nav
        data-bottom-nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <div className="grid grid-cols-5">
          {tabs.map(({ to, label, icon: Icon, active }) => (
            <Link
              key={to}
              to={to}
              aria-current={active(pathname) ? "true" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                active(pathname) ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
                {to === "/home" && homeCount > 0 && (
                  <span
                    aria-hidden
                    className="absolute -right-2.5 -top-1.5 grid h-[16px] min-w-[16px] place-items-center rounded-full bg-warning px-1 text-[9px] font-bold leading-none text-primary-foreground ring-2 ring-background"
                  >
                    {badgeText(homeCount)}
                  </span>
                )}
              </span>
              {label}
              {to === "/home" && homeCount > 0 && <span className="sr-only">, {homeCount} need you</span>}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
              moreOpen || moreActive ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <LayoutGrid className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>

      <div className="lg:py-2.5 lg:pl-[var(--nav-w)] lg:pr-2.5">
        <div className="lg:min-h-[calc(100vh-1.25rem)] lg:rounded-2xl lg:border lg:border-border/70 lg:bg-canvas">
        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className="mx-auto max-w-5xl px-4 pb-40 pt-6 focus:outline-none sm:px-6 sm:pt-8 lg:px-6 lg:pb-24 xl:px-10"
        >
          <SectionTabs email={email} />
          {/* Lazy route chunks resolve here so the rails/bottom nav never flicker.
              A crash or a chunk missing after a deploy stays inside this area. */}
          <ErrorBoundary resetKey={pathname}>
            <Suspense fallback={<RouteSkeleton />}>
              <div key={pathname} className="page-enter">
                <Outlet />
              </div>
            </Suspense>
          </ErrorBoundary>
        </main>
        </div>
      </div>
      <JumpTo open={jumpOpen} onClose={() => setJumpOpen(false)} email={email} />
      <ExportPill />
      {leo && (
        <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={null}>
            <RemixSheet user={leo} />
            <RemixPill />
          </Suspense>
        </ErrorBoundary>
      )}
      {leo && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <ActivityRecorder userId={leo.id} />
          </Suspense>
        </ErrorBoundary>
      )}
      {/* the agent's tour: Leo only, and for anyone else it only drops a typed ?tour= */}
      <ErrorBoundary>
        <TourPopover />
      </ErrorBoundary>
      <AssistantMount />
    </div>
  );
}
