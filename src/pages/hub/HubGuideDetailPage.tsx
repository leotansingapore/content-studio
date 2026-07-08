import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import Markdown from "@/components/hub/Markdown";
import type { HubPost } from "@/lib/hub";
import { supabase } from "@/lib/supabase";

export default function HubGuideDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<HubPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    supabase
      .from("hub_posts")
      .select("*")
      .eq("slug", slug)
      .maybeSingle()
      .then(({ data }) => {
        setPost((data as HubPost) ?? null);
        setLoading(false);
      });
  }, [slug]);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          Guide not found — it may have been unpublished or isn't available to your plan.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/hub/guides">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to guides
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/hub/guides">
          <ArrowLeft className="mr-2 h-4 w-4" /> Guides
        </Link>
      </Button>
      <div>
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {post.category}
        </span>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{post.title}</h1>
      </div>
      <Markdown>{post.body_md}</Markdown>
    </div>
  );
}
