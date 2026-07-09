import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Radar, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import TrendCard from "@/components/hub/TrendCard";
import type { HubTrend } from "@/lib/hub";
import { supabase } from "@/lib/supabase";

function HowItWorks() {
  const [open, setOpen] = useState(false);
  return (
    <Card className="border-border/60 bg-muted/20">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-primary" /> How trend drops work
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <CardContent className="space-y-2 pt-0 text-sm text-muted-foreground">
          <p>
            A research scout runs every 5 hours, around the clock. It checks what is
            gaining traction right now for short-form creators in your industry: formats,
            sounds, hooks, and platform changes.
          </p>
          <p>
            Each drop tells you three things: what the trend is, why it works, and a set
            of angles you can film this week. The scout remembers what it already posted,
            so you only see new finds.
          </p>
          <p>
            Drops marked <span className="font-medium text-primary">For you</span> are
            rewritten for your brand specifically: your voice, your offers, your audience.
            Nobody else sees those.
          </p>
          <p>
            Trends have a short window. The newest drops sit at the top; the fresher the
            drop, the more room there is to ride it before everyone else does.
          </p>
        </CardContent>
      )}
    </Card>
  );
}

export default function HubTrendsPage() {
  const [trends, setTrends] = useState<HubTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [niche, setNiche] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("hub_trends")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setTrends((data as HubTrend[]) ?? []);
        setLoading(false);
      });
  }, []);

  const niches = useMemo(
    () => [...new Set(trends.map((t) => t.niche))].sort(),
    [trends],
  );
  const shown = niche ? trends.filter((t) => t.niche === niche) : trends;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
          <TrendingUp className="h-5 w-5" /> Trend drops
        </h1>
        <p className="text-sm text-muted-foreground">
          Researched every few hours. Newest first.
        </p>
      </div>

      <HowItWorks />

      {niches.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            className={`rounded-full border px-3 py-1 text-xs ${niche === null ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
            onClick={() => setNiche(null)}
          >
            All
          </button>
          {niches.map((n) => (
            <button
              key={n}
              className={`rounded-full border px-3 py-1 text-xs ${niche === n ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
              onClick={() => setNiche(n)}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : shown.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            The trend scout hasn't dropped anything for your niche yet — check back in a few
            hours.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((t) => (
            <TrendCard key={t.id} trend={t} />
          ))}
        </div>
      )}
    </div>
  );
}
