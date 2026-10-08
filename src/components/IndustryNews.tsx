import { Link } from "react-router-dom";
import { Copy, ExternalLink, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { NEWS, buildNewsWriteUrl, clientMessageText, type NewsStory } from "@/lib/industryNews";

const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Singapore" });

function StoryCard({ s }: { s: NewsStory }) {
  const { toast } = useToast();
  const message = clientMessageText(s);
  const copy = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      toast({ title: "Client message copied", description: "Fill in [Client name] and [Your name] before you send it." });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-card">
      {s.clipping && (
        <a href={s.url} target="_blank" rel="noopener noreferrer" className="block aspect-[5/3] overflow-hidden bg-muted">
          <img src={s.clipping} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
        </a>
      )}
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-muted-foreground">
          <span>{when(s.publishedAt)}</span>
          <span aria-hidden className="h-1 w-1 rounded-full bg-current opacity-60" />
          <span className="truncate">{s.source}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{s.topic}</span>
        </p>
        <a
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-serif text-base font-semibold leading-snug text-foreground hover:text-primary"
        >
          {s.title}
          <ExternalLink className="ml-1 inline h-3.5 w-3.5 align-[-2px] text-muted-foreground" />
        </a>
        <p className="text-xs leading-relaxed text-muted-foreground">{s.gist}</p>
        <p className="rounded-lg bg-primary/[0.06] p-2.5 text-xs leading-relaxed text-foreground/90">
          <span className="font-semibold text-primary">Talking point: </span>
          {s.talkingPoint}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <Button asChild size="sm" className="flex-1 gap-1.5 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95">
            <Link to={buildNewsWriteUrl(s)}>
              <PenLine className="h-3.5 w-3.5" /> Write about this
            </Link>
          </Button>
          {message && (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={copy}>
              <Copy className="h-3.5 w-3.5" /> Copy client message
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function IndustryNews() {
  if (NEWS.length === 0) {
    return (
      <Card className="border-border/60 shadow-card">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No industry news in the last 30 days.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {NEWS.map((s) => (
        <StoryCard key={s.id} s={s} />
      ))}
    </div>
  );
}
