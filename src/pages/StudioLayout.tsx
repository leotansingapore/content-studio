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
} from "lucide-react";

// Primary workflow tabs, in the order a consultant actually moves through them:
// draft first, plan a week, then the reference libraries and their own saved work.
const NAV = [
  { to: "/generate", label: "Write", icon: Pencil, hint: "Draft a post" },
  { to: "/plan", label: "Plan", icon: CalendarRange, hint: "Build a week" },
  { to: "/inspiration", label: "Inspiration", icon: Lightbulb, hint: "Real examples" },
  { to: "/profiles", label: "Creators", icon: UsersIcon, hint: "Who to model" },
  { to: "/voice", label: "Voice", icon: Mic, hint: "Sound like you" },
  { to: "/drafts", label: "Drafts", icon: History, hint: "Your saved posts" },
] as const;

export default function StudioLayout() {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <NavLink
            to="/generate"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground shadow-elegant">
              <Sparkles className="h-4 w-4" />
            </span>
            Content Studio
          </NavLink>
          <div className="flex items-center gap-1">
            <NavLink
              to="/tutorial"
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`
              }
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">How it works</span>
            </NavLink>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="gap-1.5 text-muted-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>

        {/* Primary nav — horizontally scrollable on small screens, centred on wide. */}
        <nav className="mx-auto max-w-5xl px-2 sm:px-6">
          <div className="scrollbar-none -mb-px flex gap-1 overflow-x-auto pb-0">
            {NAV.map(({ to, label, icon: Icon, hint }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `group relative flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                    isActive
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`
                }
                title={hint}
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-3 py-6 sm:px-6 sm:py-9">
        <Outlet />
      </main>
    </div>
  );
}
