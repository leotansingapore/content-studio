import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useNavigationType, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProfileSwitcher from "@/components/ProfileSwitcher";
import ChannelsBlock from "@/components/ChannelsBlock";
import ExportPill from "@/components/ExportPill";
import { stopCloudSync } from "@/lib/cloudSync";
import { disablePushHere, refreshPushHere } from "@/lib/notify";
import { checkMarketEnabled, forgetMarketShown, marketShown } from "@/lib/market";
import { checkSocialConnect, forgetSocialConnect, socialConnectShown } from "@/lib/socialConnect";
import { checkMe, fetchBoard, forgetMe, ownerShown, reelsShown, seesBoard, sharedBoard, waitsOnMe } from "@/lib/reelsBoard";
import { activeProfile, applyBrandLink, profileForBusiness, rememberUser, useBrandAddress } from "@/lib/profiles";
import BrandTabWatch from "@/components/BrandTabWatch";
import { supabase } from "@/lib/supabase";
import { storedUser, useLeoUser } from "@/lib/useLeoOnly";
import { setActivityOn } from "@/lib/activity";
import { AssistantMount } from "@/components/feedback/AssistantMount";
import TourPopover from "@/components/TourPopover";
import JumpTo, { jumpShortcut } from "@/components/JumpTo";
import { pushRecent } from "@/lib/jumpTo";
import { badgeText, boardWaitingHere, countNeedsYou, onBoardWaiting } from "@/lib/needsYou";
import { loadDrafts, onDraftsChanged } from "@/lib/draftHistory";
import { useZernioOutbox } from "@/lib/useZernioOutbox";
import { readTeamPostsHere, readTeamReviews } from "@/lib/teamPosts";
import { localDateKey } from "@/lib/dueDates";
import { sgDay } from "@/lib/goals";
import { ChevronLeft, ChevronRight, ChevronUp, CircleHelp, LayoutGrid, LogOut, MessageSquarePlus, Monitor, Moon, Plus, RefreshCw, Search, Settings, Sparkles, Star, Sun, X } from "lucide-react";
import { feedbackIsNew } from "@/components/feedback/config";
import SectionTabs from "@/components/SectionTabs";
import { links } from "@/lib/links";
import { newPostHref } from "@/lib/newPost";
import { useNewVersion } from "@/lib/newVersion";
import { NAV_FOLD_KEY, applyFolded, foldShortcut, isFoldKey, readFolded, saveFolded } from "@/lib/navFold";
import { applyTheme, readTheme, resolveTheme, saveTheme, type ThemeOutlet, type ThemePick } from "@/lib/theme";
import {
  SECTIONS,
  mobileTabs,
  moreSheet,
  pageTitle,
  section,
  sectionFor,
  sectionHref,
  visiblePages,
  type MoreTile,
  type NavSection,
} from "@/lib/nav";

// One sidebar on desktop (docs/nav-overhaul.md): five places to go, one button (New post, or Ask the agent with its
// chats under it), then Brand, Settings and the account at the foot. The open section's tabs are one row at the top of
// the page (SectionTabs). Phones get a bottom bar of four and a More sheet. Every page is listed once, in src/lib/nav.ts.
const MAIN_SECTIONS = SECTIONS.filter((s) => !s.foot);
// The agent's chats (Leo only) load in their own chunk, like the agent page.
const SidebarThreads = lazy(() => import("@/components/agent/SidebarThreads"));
const AgentMeter = lazy(() => import("@/components/agent/AgentMeter"));

// The Remix sheet and its pill (north star, Leo only) read the data drops, so they load in their own chunk. The drops
// are dozens of files: fetched 2.5 s after the session says Leo, so the page's own chunks go first (Home's agent block
// waited ~5 s behind them on 26 Oct), or at once when the address opens a remix.
const RemixSheet = lazy(() => import("@/components/remix/RemixSheet"));
const RemixPill = lazy(() => import("@/components/remix/RemixPill"));
// "Your <format> is ready" when a background make finishes on another page (Leo, 11 Nov)
const MadeToast = lazy(() => import("@/components/MadeToast"));
// Activity's recorder (Leo only) listens to every job store, so it loads in its own chunk too.
const ActivityRecorder = lazy(() => import("@/components/ActivityRecorder"));

function Logo() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-elegant">
      <Sparkles className="h-4 w-4" />
    </span>
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

export const railItem = (active: boolean, folded: boolean) =>
  `relative flex h-9 shrink-0 items-center rounded-[10px] text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11 ${
    folded ? "w-10 justify-center" : "w-full gap-2.5 px-2"
  } ${active ? "bg-accent font-medium text-foreground ring-1 ring-inset ring-border [&>span>svg]:text-primary" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"}`;

function Dot({ className = "bg-warning" }: { className?: string }) {
  return <span aria-hidden className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ring-2 ring-sidebar ${className}`} />;
}

function SideLink({ s, to, active, count = 0, folded }: { s: NavSection; to: string; active: boolean; count?: number; folded: boolean }) {
  const Icon = s.icon;
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      aria-label={folded ? s.label + (count > 0 ? `, ${count} need you` : "") : undefined}
      data-tip={folded ? s.label : undefined}
      className={railItem(active, folded)}
    >
      <span className="relative flex shrink-0">
        <Icon className="h-4 w-4" />
        {folded && count > 0 && <Dot />}
      </span>
      {!folded && <span className="flex-1 truncate">{s.label}</span>}
      {!folded && count > 0 && (
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

function FootLink({ s, to, active, folded }: { s: NavSection; to: string; active: boolean; folded: boolean }) {
  const isNew = s.id === "settings" && feedbackIsNew();
  const Icon = s.icon;
  if (folded)
    return (
      <Link to={to} aria-current={active ? "page" : undefined} aria-label={s.label + (isNew ? ", new" : "")} data-tip={s.label} className={railItem(active, true)}>
        <span className="relative flex shrink-0">
          <Icon className="h-4 w-4" />
          {isNew && <Dot className="bg-primary" />}
        </span>
      </Link>
    );
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-9 items-center justify-center rounded-[10px] border px-3 text-sm font-medium transition-colors [@media(pointer:coarse)]:min-h-11 ${
        active ? "border-border bg-accent text-foreground" : "border-border/70 bg-background text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      }`}
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
const THEMES = [
  ["light", Sun, "Light"],
  ["dark", Moon, "Dark"],
  ["system", Monitor, "System"],
] as const;

/** Light, Dark or System (the device's setting), the picked one pressed. A tap keeps the account menu open. */
export function ThemeSwitch({ theme, onTheme }: { theme: ThemePick; onTheme: (t: ThemePick) => void }) {
  return (
    <div role="group" aria-label="Theme" onClick={(e) => e.stopPropagation()} className="grid grid-cols-3 gap-0.5 rounded-lg border border-border/70 p-0.5">
      {THEMES.map(([t, Icon, label]) => (
        <button
          key={t}
          type="button"
          aria-pressed={theme === t}
          onClick={() => onTheme(t)}
          className={`flex min-h-8 min-w-0 items-center justify-center gap-1 rounded-md px-1 text-xs font-medium [@media(pointer:coarse)]:min-h-11 ${
            theme === t ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" /> {label}
        </button>
      ))}
    </div>
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
  folded = false,
}: {
  folded?: boolean;
  email: string;
  settingsTo: string;
  northStar: boolean;
  active: boolean;
  theme: ThemePick;
  onTheme: (t: ThemePick) => void;
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
        <div
          role="menu"
          aria-label="Account"
          onClick={() => setOpen(false)}
          className={`z-40 rounded-xl border border-border bg-popover p-1 shadow-lg ${folded ? "fixed bottom-2.5 left-[var(--nav-w)] w-64" : "absolute inset-x-0 bottom-full mb-2"}`}
        >
          {northStar && (
            <Link role="menuitem" to="/north-star" className={item}>
              <Star className="h-4 w-4 text-muted-foreground" /> North star
            </Link>
          )}
          <Link role="menuitem" to={settingsTo} className={item}>
            <Settings className="h-4 w-4 text-muted-foreground" /> Settings
          </Link>
          <Link role="menuitem" to="/welcome" className={item}>
            <CircleHelp className="h-4 w-4 text-muted-foreground" /> Help
          </Link>
          <div className="px-1 py-1">
            <ThemeSwitch theme={theme} onTheme={onTheme} />
          </div>
          <button role="menuitem" type="button" onClick={onSignOut} className={item}>
            <LogOut className="h-4 w-4 text-muted-foreground" /> Sign out
          </button>
        </div>
      )}
      {folded ? (
        <button
          ref={trigger}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Account, ${email || "signed in"}`}
          data-tip={open ? undefined : email || "Account"}
          onClick={() => setOpen((o) => !o)}
          className={`grid h-10 w-10 place-items-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active || open ? "bg-accent" : "hover:bg-accent/60"}`}
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-primary text-sm font-semibold uppercase text-primary-foreground">{email.charAt(0) || "?"}</span>
        </button>
      ) : (
        <button
          ref={trigger}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors [@media(pointer:coarse)]:min-h-11 ${
            active ? "border-border bg-accent" : "border-border/70 bg-background hover:bg-accent/60"
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
      )}
    </div>
  );
}

/** "New version ready": said once a newer build is live, in the sidebar foot and over the phone bar (newVersion.ts). */
function NewVersion({ onLater, className = "" }: { onLater: () => void; className?: string }) {
  return (
    <div role="status" className={`flex flex-wrap items-center justify-end gap-1 rounded-xl border border-primary/40 bg-popover py-1 pl-3 pr-1 text-sm shadow-sm ${className}`}>
      {/* one row on a phone; the sidebar is too narrow for that, so the words sit over the buttons there */}
      <span className="min-w-0 flex-1 font-medium text-foreground lg:basis-full lg:pt-1">New version ready</span>
      <Button variant="ghost" size="sm" onClick={onLater} className="h-9 px-2 text-muted-foreground [@media(pointer:coarse)]:h-11">
        Later
      </Button>
      <Button size="sm" onClick={() => window.location.reload()} className="h-9 px-3 [@media(pointer:coarse)]:h-11">
        Refresh
      </Button>
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
      {tile.sectionId === "settings" && feedbackIsNew() && (
        <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">New</span>
      )}
    </Link>
  );
}

/** The path the phone bar lights for: Getting started lights Home. */
export const barPathOf = (pathname: string) => (pathname === "/welcome" ? "/home" : pathname);

export default function StudioLayout() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  // Jump to: Cmd/Ctrl+K anywhere, the button under New post, or the search button on phones.
  const [jumpOpen, setJumpOpen] = useState(false);
  const [folded, setFolded] = useState(readFolded);
  const [sliding, setSliding] = useState(false);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  // the stored session names the account on the first frame; getUser below confirms it
  const [email, setEmail] = useState<string>(() => storedUser()?.email ?? "");
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
  // Each nav item (sidebar, phone bar, More) reopens the page you last had open in its section (sectionHref).
  const lastInSection = useRef<Record<string, string>>({});

  const here = sectionFor(pathname);
  // only a page this sign-in can open, so a typed owner-only address never becomes where the item lands
  if (here && visiblePages(here.pages, email).some((p) => pathname === p.to || pathname.startsWith(p.to + "/"))) lastInSection.current[here.id] = pathname + search;

  useScrollMemory();
  // ?profile=<open brand> on every brand page, after in-app moves too
  useBrandAddress(uid);
  // Moves and cancels of auto-posts, sent to Zernio for every sign-in that can auto-post (publish-calendar)
  useZernioOutbox(uid);

  // Dark unless this device chose light or System, which follows the device's setting as it changes; public pages
  // outside this shell go back to light (src/lib/theme.ts).
  const [theme, setTheme] = useState<ThemePick>(readTheme);
  useLayoutEffect(() => {
    const os = window.matchMedia?.("(prefers-color-scheme: dark)");
    const draw = () => applyTheme(resolveTheme(theme, os?.matches ?? true));
    draw();
    os?.addEventListener?.("change", draw);
    return () => {
      os?.removeEventListener?.("change", draw);
      applyTheme(null);
    };
  }, [theme]);
  const switchTheme = (t: ThemePick) => {
    saveTheme(t);
    setTheme(t);
  };

  const version = useNewVersion();
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
  const [remixLate, setRemixLate] = useState(false);
  useEffect(() => {
    if (!leo) return;
    const t = setTimeout(() => setRemixLate(true), 2500);
    return () => clearTimeout(t);
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
        // a link that names a brand (?profile=, or ?business= by name) opens on it (docs/brand-isolation.md); the
        // address then keeps naming it (useBrandAddress)
        const sp = new URLSearchParams(window.location.search);
        if (applyBrandLink(data.user.id, sp.get("profile") ?? profileForBusiness(data.user.id, sp.get("business"))) === "reload") return window.location.reload();
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

  useLayoutEffect(() => {
    applyFolded(folded);
    setTip(null);
  }, [folded]);
  useEffect(
    () => () => {
      applyFolded(false);
    },
    [],
  );
  useEffect(() => {
    if (!sliding) return;
    const t = window.setTimeout(() => setSliding(false), 260);
    return () => window.clearTimeout(t);
  }, [sliding]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => (e.key === NAV_FOLD_KEY || e.key === null) && setFolded(readFolded());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const toggleFold = () => {
    setSliding(true);
    setFolded((f) => {
      saveFolded(!f);
      return !f;
    });
  };
  const showTip = (target: EventTarget | null) => {
    const el = folded && target instanceof Element ? target.closest<HTMLElement>("[data-tip]") : null;
    if (!el?.dataset.tip) return setTip(null);
    const r = el.getBoundingClientRect();
    setTip({ text: el.dataset.tip, x: r.right + 12, y: r.top + r.height / 2 });
  };
  useEffect(() => setTip(null), [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setJumpOpen((o) => !o);
      }
      if (isFoldKey(e) && window.matchMedia("(min-width: 1024px)").matches) {
        e.preventDefault();
        toggleFold();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Counted from what this device holds, again on every page change, tab return and half minute (and, for Leo, on
  // every autopilot change).
  useEffect(() => {
    if (!uid) return;
    const recount = () =>
      setNeedsYou(countNeedsYou(loadDrafts(uid), readTeamPostsHere(uid), readTeamReviews(uid), localDateKey(), autopilot?.waiting(uid)));
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
    // this device only (Leo, 6 Nov): the default global scope also signed out every other device on the account
    await supabase.auth.signOut({ scope: "local" });
    window.location.replace("/auth");
  };

  // Home lists everything that needs you (overdue posts, team posts, the posts board), so Home carries the count.
  const homeCount = needsYou + boardWaiting;
  const sectionTo = (s: NavSection) => sectionHref(s, email, here?.id, lastInSection.current[s.id]);
  // the phone bar reopens a section where you left it too; Home stays Home, since the agent's chats have their own tab
  const barTo = (to: string) => {
    const s = sectionFor(to);
    return s && s.id !== "home" ? sectionTo(s) : to;
  };

  const tabs = mobileTabs(email);
  // Getting started is a new sign-in's Home, though its page is filed under Settings > Help
  const barPath = barPathOf(pathname);
  const moreActive = !tabs.some((t) => t.active(barPath));
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

      <aside
        id="studio-sidebar"
        data-nav
        aria-label="Sidebar"
        onPointerOver={(e) => e.pointerType !== "touch" && showTip(e.target)}
        onPointerLeave={() => setTip(null)}
        onFocus={(e) => e.target.matches(":focus-visible") && showTip(e.target)}
        onBlur={() => setTip(null)}
        onClickCapture={() => setTip(null)}
        className="fixed inset-y-0 left-0 z-30 hidden w-[var(--nav-w)] p-2.5 transition-[width] duration-200 ease-[cubic-bezier(0.2,0,0,1)] lg:flex"
      >
        <div
          className={`flex min-h-0 w-full flex-col rounded-[20px] border border-border/70 bg-sidebar ${
            folded ? "overflow-y-auto overflow-x-hidden [scrollbar-width:none]" : sliding ? "overflow-hidden" : ""
          }`}
        >
          <div className={`flex shrink-0 items-center gap-2 pt-4 ${folded ? "px-2" : "pl-2 pr-3"}`}>
            <Link
              to="/home"
              aria-label="Postmosis home"
              data-tip={folded ? "Postmosis" : undefined}
              title={folded ? undefined : "Postmosis"}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Logo />
            </Link>
            {!folded && (
              <div className="min-w-0 flex-1">
                <ProfileSwitcher />
              </div>
            )}
          </div>
          {!folded && <ChannelsBlock userId={uid ?? leo?.id} className="px-3 pt-5" />}
          <nav aria-label="Sections" className={`space-y-1 pt-5 ${folded ? "px-2" : "px-3"}`}>
            {MAIN_SECTIONS.filter((s) => visiblePages(s.pages, email).length > 0).map((s) => (
              <SideLink key={s.id} s={s} to={sectionTo(s)} active={here?.id === s.id} count={s.id === "home" ? homeCount : 0} folded={folded} />
            ))}
          </nav>
          {folded ? (
            <div className="space-y-1 px-2 pt-5">
              <Link
                to={leo ? links.agent() : newPostHref(uid)}
                aria-label={leo ? "Ask the agent" : "New post"}
                data-tip={leo ? "Ask the agent" : "New post"}
                className="grid h-9 w-10 place-items-center rounded-[10px] border border-primary/40 bg-primary/10 text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11"
              >
                {leo ? <MessageSquarePlus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </Link>
              <button
                type="button"
                onClick={() => setJumpOpen(true)}
                aria-haspopup="dialog"
                aria-label="Jump to"
                aria-keyshortcuts="Meta+K Control+K"
                data-tip={`Jump to  ${jumpShortcut()}`}
                className={railItem(false, true)}
              >
                <span className="flex shrink-0">
                  <Search className="h-4 w-4" />
                </span>
              </button>
            </div>
          ) : (
            <div className="space-y-2 px-3 pt-5">
              <Button
                asChild
                className="h-auto min-h-10 w-full justify-start gap-2 whitespace-normal rounded-[10px] bg-gradient-primary py-2 text-left text-primary-foreground shadow-sm hover:opacity-95 [@media(pointer:coarse)]:min-h-11"
              >
                {leo ? (
                  <Link to={links.agent()}>
                    <MessageSquarePlus className="h-4 w-4" /> Ask the agent
                  </Link>
                ) : (
                  <Link to={newPostHref(uid)}>
                    <Plus className="h-4 w-4" /> New post
                  </Link>
                )}
              </Button>
              <button
                type="button"
                onClick={() => setJumpOpen(true)}
                aria-haspopup="dialog"
                aria-keyshortcuts="Meta+K Control+K"
                className="flex h-9 w-full items-center gap-2 rounded-[10px] border border-border/70 bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground [@media(pointer:coarse)]:h-11"
              >
                <Search className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">Jump to...</span>
                <kbd className="rounded border border-border/70 px-1.5 font-sans text-[10px] font-semibold">{jumpShortcut()}</kbd>
              </button>
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col px-3 pt-2">
            {leo && !folded && (
              <ErrorBoundary>
                <Suspense fallback={null}>
                  <SidebarThreads userId={leo.id} />
                </Suspense>
              </ErrorBoundary>
            )}
          </div>
          {folded ? (
            <div className="flex shrink-0 flex-col items-center gap-1 border-t border-border/70 px-2 py-3">
              {version.ready && (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  aria-label="New version ready. Refresh"
                  data-tip="New version ready: refresh"
                  className={railItem(false, true)}
                >
                  <span className="relative flex shrink-0">
                    <RefreshCw className="h-4 w-4" />
                    <Dot className="bg-primary" />
                  </span>
                </button>
              )}
              <FootLink s={section("playbook")} to={sectionTo(section("playbook"))} active={here?.id === "playbook"} folded />
              <FootLink s={section("settings")} to={sectionTo(section("settings"))} active={here?.id === "settings"} folded />
              <div className="pt-1">
                <AccountMenu
                  folded
                  email={email}
                  settingsTo={sectionTo(section("settings"))}
                  northStar={!!leo}
                  active={pathname === "/north-star"}
                  theme={theme}
                  onTheme={switchTheme}
                  onSignOut={handleSignOut}
                />
              </div>
            </div>
          ) : (
            <div className="shrink-0 space-y-2 border-t border-border/70 p-3">
              {version.ready && <NewVersion onLater={version.later} />}
              <div className="grid grid-cols-2 gap-2">
                <FootLink s={section("playbook")} to={sectionTo(section("playbook"))} active={here?.id === "playbook"} folded={false} />
                <FootLink s={section("settings")} to={sectionTo(section("settings"))} active={here?.id === "settings"} folded={false} />
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
                active={pathname === "/north-star"}
                theme={theme}
                onTheme={switchTheme}
                onSignOut={handleSignOut}
              />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={toggleFold}
          aria-label={folded ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!folded}
          aria-controls="studio-sidebar"
          aria-keyshortcuts={"Meta+\\ Control+\\"}
          title={`${folded ? "Expand" : "Collapse"} sidebar  ${foldShortcut()}`}
          className="absolute right-1 top-1/2 z-10 grid h-10 w-4 -translate-y-1/2 place-items-center rounded-full bg-card text-muted-foreground ring-1 ring-inset ring-border transition-colors before:absolute before:-inset-x-2 before:-inset-y-2 before:content-[''] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {folded ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </aside>
      {tip && (
        <div
          aria-hidden
          style={{ left: tip.x, top: tip.y }}
          className="pointer-events-none fixed z-50 hidden -translate-y-1/2 whitespace-pre rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-md lg:block"
        >
          {tip.text}
        </div>
      )}

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-1.5">
          <Link to="/home" aria-label="Postmosis home" className="flex min-h-11 min-w-11 items-center">
            <Logo />
          </Link>
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
        {/* in the top bar, so it covers nothing: clear of the chat button and the bottom bar */}
        {version.ready && <NewVersion onLater={version.later} className="mx-3 mb-2" />}
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
          {leo && (
            <ErrorBoundary>
              <Suspense fallback={null}>
                <div className="mb-3">
                  <AgentMeter />
                </div>
              </Suspense>
            </ErrorBoundary>
          )}
          <ChannelsBlock userId={uid ?? leo?.id} className="mb-4" />
          <div className="grid grid-cols-2 gap-2">
            {sheet.map((t) => (
              <MoreTileLink key={t.sectionId} tile={{ ...t, to: sectionTo(section(t.sectionId)) }} active={tileActive(t)} />
            ))}
          </div>
          <div className="mt-5 border-t border-border/70 pt-3">
            <ThemeSwitch theme={theme} onTheme={switchTheme} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-xs text-muted-foreground" title={email}>
              {email}
            </p>
            <div className="flex shrink-0 items-center gap-1">
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
          {tabs.map(({ to, label, icon: Icon, active }, i) => (
            <Link
              key={label}
              to={barTo(to)}
              aria-current={active(barPath) ? "true" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                active(barPath) ? "text-primary" : "text-muted-foreground"
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

      <div className="transition-[padding-left] duration-200 ease-[cubic-bezier(0.2,0,0,1)] lg:py-2.5 lg:pl-[var(--nav-w)] lg:pr-2.5">
        <div className="lg:min-h-[calc(100vh-1.25rem)] lg:rounded-[20px] lg:border lg:border-border/70 lg:bg-canvas lg:bg-dots">
        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className="mx-auto max-w-5xl px-4 pb-40 pt-6 focus:shadow-none focus:outline-none sm:px-6 sm:pt-8 lg:px-6 lg:pb-24 xl:px-10"
        >
          <SectionTabs email={email} />
          {/* Lazy route chunks resolve here so the rails/bottom nav never flicker.
              A crash or a chunk missing after a deploy stays inside this area. */}
          <ErrorBoundary resetKey={pathname}>
            <Suspense fallback={<RouteSkeleton />}>
              <div key={pathname} className="page-enter">
                <Outlet context={{ theme, onTheme: switchTheme } satisfies ThemeOutlet} />
              </div>
            </Suspense>
          </ErrorBoundary>
        </main>
        </div>
      </div>
      <JumpTo open={jumpOpen} onClose={() => setJumpOpen(false)} email={email} />
      <ExportPill />
      <ErrorBoundary>
        <Suspense fallback={null}>
          <MadeToast />
        </Suspense>
      </ErrorBoundary>
      {leo && (remixLate || remixKey) && (
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
      {/* another tab opened a different brand: stop this one until the person picks */}
      <ErrorBoundary>
        <BrandTabWatch userId={uid} />
      </ErrorBoundary>
      {/* the tour: the agent's on Leo's sign-ins, the studio's on everyone else's */}
      <ErrorBoundary>
        <TourPopover />
      </ErrorBoundary>
      <AssistantMount />
    </div>
  );
}
