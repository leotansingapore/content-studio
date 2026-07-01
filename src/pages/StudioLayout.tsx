import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import {
  Sparkles,
  LogOut,
  Lightbulb,
  Pencil,
  Users as UsersIcon,
  Mic,
  History,
  BookOpen,
  CalendarRange,
  Home,
  Plus,
} from "lucide-react";

type NavItem = { to: string; label: string; icon: typeof Home };

// Grouped like the leading content tools (Buffer/Typefully/Taplio): a few
// labelled sections rather than one flat list of tabs.
const NAV_GROUPS: { heading: string | null; items: NavItem[] }[] = [
  { heading: null, items: [{ to: "/home", label: "Home", icon: Home }] },
  {
    heading: "Create",
    items: [
      { to: "/generate", label: "Write", icon: Pencil },
      { to: "/plan", label: "Plan a week", icon: CalendarRange },
      { to: "/drafts", label: "My posts", icon: History },
    ],
  },
  {
    heading: "Discover",
    items: [
      { to: "/inspiration", label: "Inspiration", icon: Lightbulb },
      { to: "/profiles", label: "Creators", icon: UsersIcon },
    ],
  },
  {
    heading: "Setup",
    items: [{ to: "/voice", label: "Your voice", icon: Mic }],
  },
];

const FLAT_NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

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

  return (
    <div className="min-h-screen bg-canvas">
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
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className="space-y-1">
              {group.heading && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                  {group.heading}
                </p>
              )}
              {group.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => railItemClass(isActive)}
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
        </div>
      </aside>

      {/* Mobile top bar + scrollable tab strip */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <Brandmark />
          <div className="flex items-center gap-1">
            <NavLink
              to="/tutorial"
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
              className="gap-1.5 text-muted-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="scrollbar-none flex gap-1 overflow-x-auto px-2 pb-1.5">
          {FLAT_NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </div>
      </header>

      <div className="lg:pl-60">
        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
