import { Link } from "react-router-dom";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TREND_VIDEOS, buildVideoWriteUrl, videoThumb, videoUrl, type TrendVideo } from "@/lib/sgFeeds";

const views = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString("en-SG"));

/** /trends: this month's most-viewed Singapore personal-finance videos on YouTube. */
export default function YouTubeTrends({ videos = TREND_VIDEOS }: { videos?: TrendVideo[] }) {
  if (!videos.length) return null;
  return (
    <section className="space-y-3" aria-labelledby="youtube-trends-heading" data-testid="youtube-trends">
      <h2 id="youtube-trends-heading" className="font-serif text-xl font-semibold">
        Popular on YouTube in Singapore
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {videos.map((v) => (
          <Card key={v.id} className="flex flex-col overflow-hidden border-border/60 shadow-card">
            <a href={videoUrl(v.id)} target="_blank" rel="noopener noreferrer" className="block">
              <img src={videoThumb(v.id)} alt="" loading="lazy" className="aspect-video w-full object-cover" />
            </a>
            <CardContent className="flex flex-1 flex-col gap-2 p-3">
              <a href={videoUrl(v.id)} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-sm font-medium text-foreground hover:underline">
                {v.title}
              </a>
              <p className="text-xs text-muted-foreground">
                {[v.channel, `${views(v.views)} views`, v.published].filter(Boolean).join(" · ")}
              </p>
              <Button asChild size="sm" variant="outline" className="mt-auto gap-1.5">
                <Link to={buildVideoWriteUrl(v)}>
                  <PenLine className="h-3.5 w-3.5" /> Write about this
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
