import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigationType } from "react-router-dom";
import { Button } from "@/components/ui/button";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProfileSwitcher from "@/components/ProfileSwitcher";
import ExportPill from "@/components/ExportPill";
import { stopCloudSync } from "@/lib/cloudSync";
import { disablePushHere, refreshPushHere } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { AssistantMount } from "@/components/feedback/AssistantMount";
import { Sparkles, LogOut, Plus, LayoutGrid, X } from "lucide-react";
import { feedbackIsNew } from "@/components/feedback/config";
import {
  MOBILE_TABS,
  SECTIONS,
  moreSheet,
  pageTitle,
  pathMatches,
  section,
  sectionFor,
  visiblePages,
  type MoreTile,
  type NavSection,
} from "@/lib/nav";

// Two rails on desktop, after Slack and Supabase: rail 1 holds the sections,
// rail 2 the open section's pages. Phones keep a bottom bar and a More sheet.
// Every page is listed once, in src/lib/nav.ts.
const MAIN_SECTIONS = SECTIONS.filter((s) => !s.foot);
const FOOT_SECTIONS = SECTIONS.filter((s) => s.foot);

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

function RailLink({ s, to, active }: { s: NavSection; to: string; active: boolean }) {
  const Icon = s.icon;
  const isNew = s.id === "feedback" && feedbackIsNew();
  return (
    <Link
      to={to}
      aria-current={active ? "true" : undefined}
      className={`group relative flex w-16 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <span
        className={`flex h-8 w-11 items-center justify-center rounded-lg transition-colors ${
          active ? "bg-primary/10 text-primary" : "group-hover:bg-accent"
        }`}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      {s.label}
      {isNew && (
        <>
          <span aria-hidden className="absolute right-2.5 top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-rail" />
          <span className="sr-only">, new</span>
        </>
      )}
    </Link>
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [email, setEmail] = useState<string>("");
  const mainRef = useRef<HTMLElement>(null);
  const moreRef = useRef<HTMLDialogElement>(null);
  const prevPath = useRef(pathname);
  // Each section's rail icon reopens the page you last had open there.
  const lastInSection = useRef<Record<string, string>>({});

  const here = sectionFor(pathname);
  if (here) lastInSection.current[here.id] = pathname + search;
  const open = here ?? section("home");

  useScrollMemory();

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? "");
      if (active && data.user) void refreshPushHere();
    });
    return () => {
      active = false;
    };
  }, []);

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
    await supabase.auth.signOut();
    window.location.replace("/auth");
  };

  const moreActive = !MOBILE_TABS.some((t) => t.active(pathname));
  const sheet = moreSheet(email);
  const tileActive = (t: MoreTile) => (t.whole ? here?.id === t.sectionId : pathMatches(pathname, t.to));

  return (
    <div className="min-h-screen bg-canvas">
      <a
        href="#main-content"
        className="sr-only z-50 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* Desktop: rail 1 (sections) + rail 2 (the open section's pages) */}
      <aside data-nav className="fixed inset-y-0 left-0 z-30 hidden lg:flex">
        <nav
          aria-label="Sections"
          className="flex w-[72px] flex-col items-center gap-1 overflow-y-auto border-r border-border/70 bg-rail pb-3 pt-[18px]"
        >
          <Link
            to="/home"
            aria-label="Content Studio home"
            title="Content Studio"
            className="mb-3 rounded-xl [@media(pointer:coarse)]:mb-2 [@media(pointer:coarse)]:p-1"
          >
            <Logo />
          </Link>
          {MAIN_SECTIONS.map((s) => (
            <RailLink key={s.id} s={s} to={lastInSection.current[s.id] ?? s.to} active={here?.id === s.id} />
          ))}
          <div className="mt-auto flex flex-col items-center gap-1 pt-3">
            {FOOT_SECTIONS.map((s) => (
              <RailLink key={s.id} s={s} to={lastInSection.current[s.id] ?? s.to} active={here?.id === s.id} />
            ))}
          </div>
        </nav>

        <div className="flex w-52 flex-col border-r border-border/70 bg-sidebar xl:w-56">
          <div className="space-y-2 px-3 pb-2 pt-3.5">
            <ProfileSwitcher />
            <Button
              asChild
              className="w-full justify-start gap-2 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95 [@media(pointer:coarse)]:h-11"
            >
              <Link to="/generate">
                <Plus className="h-4 w-4" /> New post
              </Link>
            </Button>
          </div>
          <nav aria-label={open.label} className="flex-1 overflow-y-auto px-3 pb-3 pt-3">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {open.label}
            </p>
            <ul className="space-y-0.5">
              {visiblePages(open.pages, email).map((p) => (
                <li key={p.to}>
                  <NavLink
                    to={p.to}
                    end={p.end}
                    className={({ isActive }) =>
                      `block rounded-lg px-3 py-2 text-sm font-medium transition-colors [@media(pointer:coarse)]:py-3 ${
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`
                    }
                  >
                    {p.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="border-t border-border/70 px-3 py-3">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [@media(pointer:coarse)]:py-3"
            >
              <LogOut className="h-4 w-4 shrink-0" /> Sign out
            </button>
            {email && (
              <p className="truncate px-3 pt-1 text-[11px] text-muted-foreground" title={email}>
                {email}
              </p>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-1.5">
          <Brandmark />
          <ProfileSwitcher compact />
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
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {sheet.singles.map((t) => (
                <MoreTileLink key={t.to} tile={t} active={tileActive(t)} />
              ))}
            </div>
            {sheet.groups.map((g) => (
              <div key={g.label} className="space-y-1">
                <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {g.label}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {g.tiles.map((t) => (
                    <MoreTileLink key={t.to} tile={t} active={tileActive(t)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/70 pt-3">
            <p className="min-w-0 truncate text-xs text-muted-foreground" title={email}>
              {email}
            </p>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="h-11 shrink-0 gap-1.5 text-muted-foreground">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        </div>
      </dialog>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Primary"
        data-nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <div className="grid grid-cols-5">
          {MOBILE_TABS.map(({ to, label, icon: Icon, active }) => (
            <Link
              key={to}
              to={to}
              aria-current={active(pathname) ? "true" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                active(pathname) ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
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

      <div className="lg:pl-[var(--nav-w)]">
        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className="mx-auto max-w-5xl px-4 pb-40 pt-6 focus:outline-none sm:px-6 sm:pt-8 lg:px-6 lg:pb-8 xl:px-10"
        >
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
      <ExportPill />
      <AssistantMount />
    </div>
  );
}
