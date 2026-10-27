// /settings (Fastlane's Settings, docs/fastlane-nav-gap.md): the set-up pages as tiles under their group, opened from
// the account menu. Each page it lists leads back here instead of showing tabs. Tiles and hints come from nav.ts.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { groupedPages, section, visiblePages } from "@/lib/nav";
import { supabase } from "@/lib/supabase";
import { startTour } from "@/lib/tour";
import { useTourUser } from "@/lib/useTourUser";

export default function SettingsPage() {
  const [email, setEmail] = useState("");
  const tour = useTourUser();
  const navigate = useNavigate();
  useEffect(() => {
    // getSession reads the stored session: no Auth round trip under the client lock
    void supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? ""));
  }, []);
  const settings = section("settings");
  const tiles = visiblePages(groupedPages(settings.pages.slice(1)), email);
  const groups = [...new Set(tiles.map((p) => p.group ?? ""))];
  return (
    <div className="space-y-8">
      <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h1>
      {groups.map((g) => (
        <section key={g} aria-label={g} className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{g}</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tiles
              .filter((p) => (p.group ?? "") === g)
              .map((p) => {
                const Icon = p.icon ?? settings.icon;
                return (
                  <li key={p.to}>
                    <Link to={p.to} className="flex min-h-11 items-start gap-3 rounded-xl p-3 transition-colors hover:bg-accent">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border/70 bg-card text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-foreground">{p.label}</span>
                        {p.hint && <span className="mt-0.5 block text-xs text-muted-foreground">{p.hint}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
      {tour && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5">
          <div>
            <p className="text-sm font-semibold text-foreground">Tour of the studio</p>
            <p className="text-xs text-muted-foreground">A one-minute look at the main pages{tour.agent ? ", led by the agent" : ""}.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              startTour(tour.id, null, tour.steps);
              navigate("/home");
            }}
            className="h-11 gap-2 sm:h-9"
          >
            <Compass className="h-4 w-4" /> Replay the tour
          </Button>
        </div>
      )}
    </div>
  );
}
