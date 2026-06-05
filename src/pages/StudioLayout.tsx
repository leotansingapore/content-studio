import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
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

export default function StudioLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  const onGenerate = location.pathname.startsWith("/generate");
  const onPlan = location.pathname.startsWith("/plan");
  const onInspiration = location.pathname.startsWith("/inspiration");
  const onProfiles = location.pathname.startsWith("/profiles");
  const onVoice = location.pathname.startsWith("/voice");
  const onDrafts = location.pathname.startsWith("/drafts");
  const onTutorial = location.pathname.startsWith("/tutorial");

  const tabClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
      active
        ? "bg-background text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Consultant Content Studio
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="gap-1.5 text-muted-foreground"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-3 py-6 sm:px-6 sm:py-10">
        {onGenerate && (
          <header className="space-y-2">
            <h1 className="font-serif text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
              Draft a post that earns attention and trust
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Pick a pillar, a funnel stage, and an idea source — the generator
              drafts a post that fits where your reader is in the funnel:
              Attraction, Building Trust, or Conversion. New here? Build a full
              week in{" "}
              <NavLink to="/plan" className="font-semibold text-primary hover:underline">
                Plan
              </NavLink>
              .
            </p>
          </header>
        )}

        <nav className="inline-flex flex-wrap rounded-xl border border-border/60 bg-muted/30 p-1">
          <NavLink to="/generate" className={tabClass(onGenerate)}>
            <Pencil className="h-3.5 w-3.5" /> Generate
          </NavLink>
          <NavLink to="/plan" className={tabClass(onPlan)}>
            <CalendarRange className="h-3.5 w-3.5" /> Plan
          </NavLink>
          <NavLink to="/inspiration" className={tabClass(onInspiration)}>
            <Lightbulb className="h-3.5 w-3.5" /> Inspiration
          </NavLink>
          <NavLink to="/profiles" className={tabClass(onProfiles)}>
            <UsersIcon className="h-3.5 w-3.5" /> Profiles
          </NavLink>
          <NavLink to="/voice" className={tabClass(onVoice)}>
            <Mic className="h-3.5 w-3.5" /> Voice
          </NavLink>
          <NavLink to="/drafts" className={tabClass(onDrafts)}>
            <History className="h-3.5 w-3.5" /> Drafts
          </NavLink>
          <NavLink to="/tutorial" className={tabClass(onTutorial)}>
            <BookOpen className="h-3.5 w-3.5" /> Tutorial
          </NavLink>
        </nav>

        <Outlet />
      </main>
    </div>
  );
}
