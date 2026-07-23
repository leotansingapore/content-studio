import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import {
  Sparkles,
  LogOut,
  Lightbulb,
  Pencil,
  Users as UsersIcon,
  History,
  BookOpen,
  Home,
  Plus,
  BookMarked,
  GraduationCap,
  CalendarClock,
  TrendingUp,
  BarChart3,
  Columns3,
  LayoutGrid,
  X,
  Flame,
} from "lucide-react";

type NavItem = { to: string; label: string; icon: typeof Home; also?: string[] };

// Grouped like the leading content tools (Buffer/Typefully/Taplio): a few
// labelled sections rather than one flat list of tabs. Merged sections keep
// their routes — `also` lists sibling paths that light this entry up, and
// SectionTabs on the pages themselves moves between siblings.
const NAV_GROUPS: { heading: string | null; items: NavItem[] }[] = [
  { heading: null, items: [{ to: "/home", label: "Home", icon: Home }] },
  {
    heading: "Create",
    items: [
      { to: "/generate", label: "Write", icon: Pencil },
      {
        to: "/plan",
        label: "Pipeline",
        icon: Columns3,
        also: ["/calendar", "/board", "/drafts"],
      },
    ],
  },
  {
    heading: "Improve",
    items: [
      {
        to: "/analytics",
        label: "Performance",
        icon: BarChart3,
        also: ["/coach"],
      },
      {
        to: "/academy",
        label: "Learn",
        icon: GraduationCap,
        also: ["/create-guide", "/tutorial"],
      },
    ],
  },
  {
    heading: "Discover",
    items: [
      { to: "/swipe", label: "Top posts", icon: TrendingUp },
      { to: "/trends", label: "Trends", icon: Flame },
      { to: "/inspiration", label: "Inspiration", icon: Lightbulb },
      { to: "/profiles", label: "Creators", icon: UsersIcon },
    ],
  },
  {
    heading: "Setup",
    items: [
      {
        to: "/playbook",
        label: "My Playbook",
        icon: BookMarked,
        also: ["/voice", "/fads"],
      },
    ],
  },
];

// The four destinations FCs hit daily live on the mobile bottom bar; the rest
// sit one tap away behind "More". Order mirrors the create-first workflow.
const MOBILE_PRIMARY: NavItem[] = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/generate", label: "Write", icon: Pencil },
  { to: "/calendar", label: "Calendar", icon: CalendarClock },
  { to: "/drafts", label: "Posts", icon: History },
];

const MOBILE_PRIMARY_PATHS = new Set(MOBILE_PRIMARY.map((i) => i.to));

const MOBILE_MORE_GROUPS = NAV_GROUPS.map((g) => ({
  heading: g.heading,
  items: g.items.filter((i) => !MOBILE_PRIMARY_PATHS.has(i.to)),
})).filter((g) => g.items.length > 0);

function Brandmark() {
  return (
    <NavLink to="/home" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-elegant">
        <Sparkles className="h-4 w-4" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-sm font-bold tracking-tight text-foreground">
          Content Studio
        </span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          for advisors
        </span>
      </span>
    </NavLink>
  );
}

export default function StudioLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? "");
    });
    return () => {
      active = false;
    };
  }, []);

  // Close the More sheet whenever the route changes.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  const railItemClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      active
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-accent hover:text-foreground"
    }`;

  const moreActive =
    !MOBILE_PRIMARY.some(
      (i) => pathname === i.to || pathname.startsWith(i.to + "/"),
    ) && pathname !== "/welcome";

  return (
    <div className="min-h-screen bg-canvas">
      <a
        href="#main-content"
        className="sr-only z-50 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* Desktop left sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border/70 bg-sidebar lg:flex">
        <div className="px-4 py-4">
          <Brandmark />
        </div>
        <div className="px-3 pb-3">
          <Button
            asChild
            className="w-full justify-start gap-2 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95"
          >
            <NavLink to="/generate">
              <Plus className="h-4 w-4" /> New post
            </NavLink>
          </Button>
        </div>
        <nav
          aria-label="Primary"
          className="flex-1 space-y-4 overflow-y-auto px-3 py-2"
        >
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className="space-y-1">
              {group.heading && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                  {group.heading}
                </p>
              )}
              {group.items.map(({ to, label, icon: Icon, also }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    railItemClass(
                      isActive ||
                        (also?.some(
                          (p) => pathname === p || pathname.startsWith(p + "/"),
                        ) ??
                          false),
                    )
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="space-y-1 border-t border-border/70 px-3 py-3">
          <NavLink
            to="/tutorial"
            className={({ isActive }) => railItemClass(isActive)}
          >
            <BookOpen className="h-4 w-4 shrink-0" /> How it works
          </NavLink>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4 shrink-0" /> Sign out
          </button>
          {email && (
            <p
              className="truncate px-3 pt-1 text-[11px] text-muted-foreground/70"
              title={email}
            >
              {email}
            </p>
          )}
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <Brandmark />
          <div className="flex items-center gap-1">
            <NavLink
              to="/tutorial"
              aria-label="How it works"
              title="How it works"
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`
              }
            >
              <BookOpen className="h-3.5 w-3.5" />
            </NavLink>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign out"
              className="gap-1.5 text-muted-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile "More" sheet */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="More pages"
        >
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-foreground/40"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-2xl border-t border-border/70 bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                All pages
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="h-8 w-8 p-0 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4">
              {MOBILE_MORE_GROUPS.map((group, gi) => (
                <div key={gi} className="space-y-1">
                  {group.heading && (
                    <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                      {group.heading}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {group.items.map(({ to, label, icon: Icon }) => (
                      <NavLink
                        key={to}
                        to={to}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                            isActive
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border/70 bg-card text-foreground hover:border-primary/40"
                          }`
                        }
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <div className="grid grid-cols-5">
          {MOBILE_PRIMARY.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
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

      <div className="lg:pl-60">
        <main
          id="main-content"
          className={`mx-auto px-4 pb-24 pt-6 sm:px-6 sm:pt-8 lg:px-10 lg:pb-8 ${
            // The board is a horizontal Kanban — let it use the full width so the
            // stages fan out instead of scrolling inside a narrow column.
            pathname === "/board" ? "max-w-[100rem]" : "max-w-5xl"
          }`}
        >
          {/* Lazy route chunks resolve here so the rail/bottom nav never flickers. */}
          <Suspense
            fallback={
              <div className="p-8 text-sm text-muted-foreground">Loading…</div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
