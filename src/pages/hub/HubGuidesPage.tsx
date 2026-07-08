import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HUB_CATEGORIES, type HubPost } from "@/lib/hub";
import { supabase } from "@/lib/supabase";

export default function HubGuidesPage() {
  const [posts, setPosts] = useState<HubPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("hub_posts")
      .select("id,title,slug,category,audience_type,created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setPosts((data as HubPost[]) ?? []);
        setLoading(false);
      });
  }, []);

  const shown = category ? posts.filter((p) => p.category === category) : posts;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
          <BookOpen className="h-5 w-5" /> Guides
        </h1>
        <p className="text-sm text-muted-foreground">
          Editing, videography, and trend playbooks — the exact workflows behind client content.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className={`rounded-full border px-3 py-1 text-xs ${category === null ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          onClick={() => setCategory(null)}
        >
          All
        </button>
        {HUB_CATEGORIES.map((c) => (
          <button
            key={c.value}
            className={`rounded-full border px-3 py-1 text-xs ${category === c.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
            onClick={() => setCategory(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : shown.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No guides here yet — the library is being written.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((p) => (
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
    </div>
  );
}
