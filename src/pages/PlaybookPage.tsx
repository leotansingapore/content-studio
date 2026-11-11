import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { loadPositioning } from "@/lib/positioning";
import { loadVoiceProfile } from "@/lib/voiceProfile";
import { brandOverview, completeness } from "@/lib/brandOverview";
import { loadBrand } from "@/lib/carousel";
import { loadScriptContext } from "@/lib/scriptContext";
import { loadMarket } from "@/lib/market";
import { loadAudiences } from "@/lib/audiences";
import { loadProducts } from "@/lib/products";
import { loadCompetitors } from "@/lib/competitors";
import { demoVideos } from "@/lib/demoVideos";
import { loadMedia } from "@/lib/mediaLibrary";
import { useLeoUser, useSignedInUser } from "@/lib/useLeoOnly";
import { useScrollToHash } from "@/lib/urlState";
import { loadSaved, type SavedItems } from "@/lib/savedItems";
import { adviserBrand } from "@/lib/profession";
import inspirationData from "@/data/inspiration.json";
import advisorsData from "@/data/advisors.json";
import {
  Target,
  Lightbulb,
  Users as UsersIcon,
  CheckCircle2,
  ChevronRight,
  ArrowRight,
  Bookmark,
} from "lucide-react";

type Insp = { id: string; hook: string; topic: string };
type Adv = { id: string; name: string; handle: string };

const INSP = inspirationData as Insp[];
const ADV = advisorsData as Adv[];

function SectionCard({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: typeof Target;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function PlaybookPage() {
  const leo = useLeoUser();
  // the stored session answers on the first frame, so the page never paints an empty brand and then fills in
  const user = useSignedInUser();
  const [saved, setSaved] = useState<SavedItems>({
    inspiration: [],
    creators: [],
    topPosts: [],
  });

  useEffect(() => {
    document.title = "My Playbook - Postmosis";
  }, []);

  // read on each draw: these stores change on other pages, and this page only shows them
  const uid = user?.id ?? null;
  useEffect(() => setSaved(loadSaved(uid)), [uid]);
  const isLeo = !!leo && !!uid;
  // /playbook#look lands on that group once the sign-in is known (docs/deep-links.md)
  useScrollToHash(!!uid);
  const groups = brandOverview({
    leo: isLeo,
    kit: loadBrand(uid),
    positioning: loadPositioning(uid),
    voice: loadVoiceProfile(uid),
    ...(isLeo && uid
      ? {
        proof: loadScriptContext(uid).product.proof,
        marketName: loadMarket(uid).name,
        audiences: loadAudiences(uid),
        products: loadProducts(uid).items,
        competitors: loadCompetitors(uid).list,
        demos: demoVideos(uid).length,
        media: loadMedia(uid, { videos: true }).length,
      }
      : {}),
  });
  const done = completeness(groups);
  const next = done.missing[0];
  const name = groups[0].rows[0].value;
  const savedInsp = saved.inspiration
    .map((id) => INSP.find((e) => e.id === id))
    .filter(Boolean) as Insp[];
  const savedAdv = saved.creators
    .map((id) => ADV.find((a) => a.id === id))
    .filter(Boolean) as Adv[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          My Playbook
        </h1>
      </header>

      {/* What the AI knows: one row per fact, each opening the place that edits it */}
      {uid && <section aria-labelledby="known-title" className="space-y-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h2 id="known-title" className="font-serif text-lg font-semibold">
              What the AI knows about {name || "your brand"}
            </h2>
            {next && (
              <Button asChild size="sm" className="gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95 [@media(pointer:coarse)]:h-11">
                <Link to={next.to}>
                  Next: {next.add} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div
              role="progressbar"
              aria-label="Brand facts on file"
              aria-valuemin={0}
              aria-valuemax={done.total}
              aria-valuenow={done.set}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(done.set / Math.max(1, done.total)) * 100}%` }} />
            </div>
            <p className="shrink-0 text-xs tabular-nums text-muted-foreground" data-testid="known-count">
              {done.missing.length ? `${done.set} of ${done.total} on file` : (
                <span className="inline-flex items-center gap-1 font-medium text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> All {done.total} on file
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.id} id={g.id} className="min-w-0 scroll-mt-20 border-border/60 shadow-card">
              <CardHeader className="pb-1">
                <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{g.title}</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <ul>
                  {g.rows.map((r) => (
                    <li key={r.id}>
                      <Link
                        to={r.to}
                        className="group flex min-h-11 items-start gap-3 rounded-md px-3 py-2 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="w-28 shrink-0 pt-0.5 text-xs text-muted-foreground sm:w-36">{r.label}</span>
                        <span className="min-w-0 flex-1 text-sm">
                          {r.swatches?.length ? (
                            <span className="flex flex-wrap gap-1.5 pt-0.5">
                              {r.swatches.map((hex, k) => (
                                <span key={k} title={hex} className="h-5 w-5 rounded-full border border-border/60" style={{ backgroundColor: hex }} />
                              ))}
                            </span>
                          ) : r.chips?.length ? (
                            <span className="flex flex-wrap gap-1.5">
                              {r.chips.map((c) => (
                                <span key={c} className="max-w-full truncate rounded-md border border-border/60 bg-background px-2 py-0.5 text-xs text-foreground">{c}</span>
                              ))}
                            </span>
                          ) : r.value ? (
                            <span className="line-clamp-2 break-words text-foreground">{r.value}</span>
                          ) : (
                            <span className="font-medium text-primary group-hover:underline">{r.add}</span>
                          )}
                        </span>
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>}

      {/* Saved: Inspiration and Creators are an adviser brand's libraries; another brand sees only what it saved before */}
      {(adviserBrand(user?.id) || savedInsp.length + savedAdv.length > 0) && <div className="grid gap-4 md:grid-cols-2">
        <SectionCard icon={Lightbulb} title={`Saved inspiration (${savedInsp.length})`}>
          {savedInsp.length ? (
            <ul className="space-y-2">
              {savedInsp.slice(0, 6).map((e) => (
                <li key={e.id}>
                  <Link
                    to={`/inspiration/${encodeURIComponent(e.id)}`}
                    className="group flex items-start gap-2 text-sm text-foreground hover:text-primary"
                  >
                    <Bookmark className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-primary/20 text-primary" />
                    <span className="line-clamp-2 leading-snug">{e.hook}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Bookmark examples in{" "}
              <Link to="/inspiration" className="font-semibold text-primary hover:underline">
                Inspiration
              </Link>{" "}
              and they'll collect here.
            </p>
          )}
        </SectionCard>

        <SectionCard icon={UsersIcon} title={`Saved creators (${savedAdv.length})`}>
          {savedAdv.length ? (
            <ul className="space-y-2">
              {savedAdv.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/profiles/${encodeURIComponent(a.id)}`}
                    className="group flex items-center gap-2 text-sm text-foreground hover:text-primary"
                  >
                    <Bookmark className="h-3.5 w-3.5 shrink-0 fill-primary/20 text-primary" />
                    <span className="font-medium">{a.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {a.handle}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Bookmark creators in{" "}
              <Link to="/profiles" className="font-semibold text-primary hover:underline">
                Creators
              </Link>{" "}
              to build your follow list.
            </p>
          )}
        </SectionCard>
      </div>}

      <div className="flex flex-wrap gap-2">
        <Button asChild variant={next ? "outline" : "default"} className={next ? "gap-1.5" : "gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95"}>
          <Link to="/generate">
            Write a post <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="gap-1.5">
          <Link to="/coach">Check my content in Coach</Link>
        </Button>
      </div>
    </div>
  );
}
