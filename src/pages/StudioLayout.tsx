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
} from "lucide-react";

export default function StudioLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  const onGenerate = location.pathname.startsWith("/generate");
  const onInspiration = location.pathname.startsWith("/inspiration");
  const onProfiles = location.pathname.startsWith("/profiles");
  const onVoice = location.pathname.startsWith("/voice");
  const onDrafts = location.pathname.startsWith("/drafts");

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
            Content Studio
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
        <header className="space-y-2">
          <h1 className="font-serif text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
            Draft a social post in 60 seconds
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Built around the Day 40-42 framework. Pick a pillar, an idea
            source, a format - the generator drafts a post that hits Authority
            + Social + a soft CTA.
          </p>
        </header>

        <nav className="inline-flex flex-wrap rounded-xl border border-border/60 bg-muted/30 p-1">
          <NavLink to="/generate" className={tabClass(onGenerate)}>
            <Pencil className="h-3.5 w-3.5" /> Generate
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
        </nav>

        <Outlet />
      </main>
    </div>
  );
}
