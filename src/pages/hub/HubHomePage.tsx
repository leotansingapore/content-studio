import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Loader2, Settings2, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useHub } from "@/components/hub/HubGate";
import TrendCard from "@/components/hub/TrendCard";
import { INDUSTRIES, setIndustry, type HubPost, type HubTrend } from "@/lib/hub";
import { supabase } from "@/lib/supabase";

function IndustryPicker() {
  const { refresh } = useHub();
  const { toast } = useToast();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!value) return;
    setSaving(true);
    try {
      await setIndustry(value);
      await refresh();
      toast({ title: "Industry saved", description: "Your hub is now tuned to " + value + "." });
    } catch {
      toast({ title: "Couldn't save industry", description: "Try again in a minute." });
      setSaving(false);
    }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Pick your industry</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row">
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger className="sm:max-w-xs">
            <SelectValue placeholder="Choose your industry" />
          </SelectTrigger>
          <SelectContent>
            {INDUSTRIES.map((i) => (
              <SelectItem key={i} value={i}>
                {i}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={save} disabled={!value || saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

export default function HubHomePage() {
  const { membership, access } = useHub();
  const [trends, setTrends] = useState<HubTrend[]>([]);
  const [posts, setPosts] = useState<HubPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase
        .from("hub_trends")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("hub_posts")
        .select("id,title,slug,category,created_at")
        .order("created_at", { ascending: false })
        .limit(4),
    ])
      .then(([t, p]) => {
        setTrends((t.data as HubTrend[]) ?? []);
        setPosts((p.data as HubPost[]) ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const needsIndustry = membership?.status === "active" && !membership.industry;
  const firstName = membership?.email?.split("@")[0] ?? "there";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Members Hub</h1>
          <p className="text-sm text-muted-foreground">
            {membership?.industry
              ? `Tuned to ${membership.industry}. Fresh drops land every few hours.`
              : `Welcome, ${firstName}.`}
          </p>
        </div>
        {access === "admin" && (
          <Button asChild variant="outline" size="sm">
            <Link to="/hub/admin">
              <Settings2 className="mr-2 h-4 w-4" /> Open admin
            </Link>
          </Button>
        )}
      </div>

      {needsIndustry && <IndustryPicker />}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <TrendingUp className="h-4 w-4" /> Latest drops
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/hub/trends">
              All trends <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : trends.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              The trend scout hasn't dropped anything for your niche yet — check back in a few
              hours.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {trends.map((t) => (
              <TrendCard key={t.id} trend={t} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <BookOpen className="h-4 w-4" /> Guides
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/hub/guides">
              All guides <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
        {posts.length === 0 && !loading ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Guides are being written — the library opens soon.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {posts.map((p) => (
              <Link key={p.id} to={`/hub/guides/${p.slug}`}>
                <Card className="h-full transition-colors hover:border-primary/40">
                  <CardHeader className="pb-2">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {p.category}
                    </span>
                    <CardTitle className="text-sm leading-snug">{p.title}</CardTitle>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
