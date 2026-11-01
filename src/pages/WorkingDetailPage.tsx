import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Copy, ExternalLink, Images, Sparkles } from "lucide-react";
import CopyLinkButton from "@/components/CopyLinkButton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import { compact, multipleLabel } from "@/lib/carouselLibrary";
import { supabase } from "@/lib/supabase";
import { DETAIL_COLUMNS, TABLE, agentPrompt, nicheLabel, saveRateLabel, slideUrl, tagLabel, type WorkingRow } from "@/lib/workingLibrary";

export default function WorkingDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const back = (state as { back?: string } | null)?.back ?? "/working";
  const [row, setRow] = useState<WorkingRow | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    setRow(undefined);
    supabase
      .from(TABLE)
      .select(DETAIL_COLUMNS)
      .eq("id", id)
      .maybeSingle()
      .then(
        ({ data }) => live && setRow((data as WorkingRow | null) ?? null),
        () => live && setRow(null),
      );
    return () => {
      live = false;
    };
  }, [id]);

  useEffect(() => {
    document.title = row ? `@${row.author}'s slideshow - Postmosis` : "Slideshow - Postmosis";
    return () => {
      document.title = "Postmosis";
    };
  }, [row]);

  if (row === undefined) return <div className="h-[60vh] animate-pulse rounded-xl bg-muted" aria-label="Loading the slideshow" />;
  if (row === null)
    return (
      <EmptyState icon={Images} title="Slideshow not found" actions={<Button asChild variant="outline" size="sm"><Link to="/working">Back to What's working</Link></Button>}>
        It may have been taken out of the library.
      </EmptyState>
    );

  const said = row.slide_text.some((t) => t.trim());
  const rate = saveRateLabel(row.saves, row.views);
  const hookText = row.hook_text.trim();
  const about = [
    ["Hook", [tagLabel(row.hook), hookText && `"${hookText}"`].filter(Boolean).join(": ")],
    ["Format", tagLabel(row.format)],
    ["Structure", tagLabel(row.structure)],
  ].filter((x): x is [string, string] => Boolean(x[1]));
  const copyPrompt = () =>
    navigator.clipboard.writeText(agentPrompt(row)).then(
      () => toast({ title: "Prompt copied", description: "Paste it to Claude to rebuild this format for your brand." }),
      () => toast({ title: "Copy failed", variant: "destructive" }),
    );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Link to={back}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to What's working
          </Link>
        </Button>
        <CopyLinkButton label="Copy link to this slideshow" />
      </div>

      <section aria-label="Slides" className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {Array.from({ length: row.slides }, (_, i) => (
          <img
            key={i}
            src={slideUrl(row.id, i + 1)}
            alt={row.slide_text[i]?.trim() ? `Slide ${i + 1}: ${row.slide_text[i].trim().slice(0, 200)}` : `Slide ${i + 1} of ${row.slides}`}
            loading={i < 4 ? "eager" : "lazy"}
            decoding="async"
            className="aspect-[3/4] w-40 shrink-0 snap-start rounded-xl bg-muted object-cover sm:w-52"
          />
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <section aria-label="About this slideshow" className="space-y-5">
          <div className="space-y-1.5">
            <Link to={`/working?q=${encodeURIComponent(row.author)}`} className="text-sm font-semibold text-foreground hover:text-primary">@{row.author}</Link>
            <p className="text-xs text-muted-foreground">
              {[
                row.followers !== null && `${compact(row.followers)} followers`,
                row.posted_at && `Posted ${new Date(row.posted_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`,
                nicheLabel(row.niche),
              ].filter(Boolean).join(" · ")}
            </p>
            <h1 className="font-serif text-xl font-semibold leading-snug">{row.summary.trim() || `@${row.author}'s slideshow`}</h1>
          </div>

          {row.ratio !== null && (
            <p className="flex items-center gap-3">
              <span className="rounded-lg bg-primary px-2.5 py-1.5 text-lg font-bold tabular-nums text-primary-foreground">{multipleLabel(row.ratio)}</span>
              <span className="text-xs font-medium text-foreground">@{row.author}'s usual views</span>
            </p>
          )}

          <dl className="grid grid-cols-2 gap-3 border-y border-border/60 py-3 text-sm sm:grid-cols-4">
            {[
              ["Views", compact(row.views)],
              ["Saves", compact(row.saves)],
              ["Save rate", rate || "-"],
              ["Shares", compact(row.shares)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          {about.length > 0 && (
            <dl className="space-y-2 text-sm">
              {about.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section aria-label="Use this format" className="space-y-3 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <Button size="lg" className="w-full gap-2" onClick={() => navigate(`/generate?working=${encodeURIComponent(row.id)}`)}>
            <Sparkles className="h-4 w-4" /> Make one like this <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="w-full gap-2" onClick={copyPrompt}>
            <Copy className="h-4 w-4" /> Copy a prompt for your agent
          </Button>
          <Button asChild variant="outline" className="w-full gap-2">
            <a href={row.url} target="_blank" rel="noopener noreferrer">
              View the original on TikTok <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
          <p className="text-xs text-muted-foreground">@{row.author} owns this post. Study how it works, then make your own.</p>
        </section>

        {(row.caption || said) && (
          <div className="space-y-5">
            {row.caption && (
              <details className="rounded-lg border border-border/60 p-3 text-sm">
                <summary className="cursor-pointer font-medium">Caption</summary>
                <p className="mt-2 whitespace-pre-line text-muted-foreground">{row.caption}</p>
              </details>
            )}
            {said && (
              <details className="rounded-lg border border-border/60 p-3 text-sm" open>
                <summary className="cursor-pointer font-medium">What each slide says</summary>
                <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted-foreground">
                  {Array.from({ length: row.slides }, (_, i) => (
                    <li key={i}>{row.slide_text[i]?.replace(/\s+/g, " ").trim() || "No words on this slide"}</li>
                  ))}
                </ol>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
