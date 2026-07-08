import { useEffect, useMemo, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import TrendCard from "@/components/hub/TrendCard";
import type { HubTrend } from "@/lib/hub";
import { supabase } from "@/lib/supabase";

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
