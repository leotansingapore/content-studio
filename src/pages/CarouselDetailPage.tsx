import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, ExternalLink, Heart, Layers, MessageCircle, Sparkles, UserCheck, UserPlus } from "lucide-react";
import CopyLinkButton from "@/components/CopyLinkButton";
import RemixButton from "@/components/remix/RemixButton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { fromCarousel, rememberSourceText } from "@/lib/remixSource";
import { supabase } from "@/lib/supabase";
import { useUrlState } from "@/lib/urlState";
import { cn } from "@/lib/utils";
import {
  CARD_COLUMNS,
  DETAIL_COLUMNS,
  compact,
  coverPath,
  loadShelf,
  publicUrl,
  multipleLabel,
  remixText,
  saveShelf,
  slidePath,
  tierOf,
  toggleSaved,
  toggleTracked,
  type CarouselCard,
  type CarouselRow,
  type Shelf,
} from "@/lib/carouselLibrary";
import { CarouselCardView } from "@/pages/CarouselsPage";

const RELATED = 6;
const NO_FOLDER = "none";

export default function CarouselDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const back = (state as { back?: string } | null)?.back ?? "/carousels";
  const [row, setRow] = useState<CarouselRow | null | undefined>(undefined);
  const [similar, setSimilar] = useState<CarouselCard[]>([]);
  const [more, setMore] = useState<CarouselCard[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [shelf, setShelfState] = useState<Shelf>({ folders: [], saved: [], tracked: [], searches: [] });
  const [slideParam, setSlideParam] = useUrlState<string>("slide", "1");
  const n = Math.max(0, Math.min((row?.slides ?? 1) - 1, (Number(slideParam) || 1) - 1));

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) setShelfState(loadShelf(uid));
    });
  }, []);

  useEffect(() => {
    let live = true;
    setRow(undefined);
    supabase
      .from("cs_carousels")
      .select(DETAIL_COLUMNS)
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (!live) return;
        const r = (data as CarouselRow | null) ?? null;
        setRow(r);
        if (!r) return;
        // the Remix sheet reads every slide's words for this tab, not the 400-character snapshot
        rememberSourceText(fromCarousel(r).key, remixText(r));
        const related = () => supabase.from("cs_carousels").select(CARD_COLUMNS);
        const others = (q: ReturnType<typeof related>) => q.neq("id", r.id).order("multiple", { ascending: false }).limit(RELATED);
        let similarQ = related();
        if (r.topic) similarQ = similarQ.eq("topic", r.topic);
        if (r.format) similarQ = similarQ.eq("format", r.format);
        void others(similarQ).then(({ data: s }) => live && setSimilar((s as CarouselCard[]) ?? []));
        void others(related().eq("creator", r.creator)).then(({ data: m }) => live && setMore((m as CarouselCard[]) ?? []));
      });
    return () => {
      live = false;
    };
  }, [id]);

  useEffect(() => {
    document.title = row ? `${row.title.slice(0, 60)} - Postmosis` : "Carousel - Postmosis";
    return () => {
      document.title = "Postmosis";
    };
  }, [row]);

  const go = useCallback((to: number) => row && setSlideParam(String(((to + row.slides) % row.slides) + 1)), [row, setSlideParam]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === "ArrowRight") go(n + 1);
      if (e.key === "ArrowLeft") go(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, n]);

  const setShelf = (next: Shelf) => {
    setShelfState(next);
    if (userId && !saveShelf(userId, next)) toast({ title: "Couldn't save on this device", description: "Storage is full or blocked." });
  };
  const savedTo = shelf.saved.find((s) => s.id === id);
  const tracked = row ? shelf.tracked.includes(row.creator) : false;
  const savedIds = useMemo(() => new Set(shelf.saved.map((s) => s.id)), [shelf.saved]);
  const onCardSave = (e: MouseEvent, cid: string) => {
    e.preventDefault();
    e.stopPropagation();
    setShelf(toggleSaved(shelf, cid, shelf.saved.find((s) => s.id === cid)?.folder ?? null));
  };

  if (row === undefined) return <div className="h-[60vh] animate-pulse rounded-xl bg-muted" aria-label="Loading the carousel" />;
  if (row === null)
    return (
      <EmptyState icon={Layers} title="Carousel not found" actions={<Button asChild variant="outline" size="sm"><Link to="/carousels">Back to the library</Link></Button>}>
        It may have been taken out of the library.
      </EmptyState>
    );

  const tier = tierOf(row.multiple);
  const isVideo = row.video_positions.includes(n);
  const words = row.slide_text[n]?.trim();
  const source = fromCarousel(row, publicUrl(coverPath(row.id)));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Link to={back}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to carousels
          </Link>
        </Button>
        <CopyLinkButton label="Copy link to this carousel" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <section aria-label="Slides" className="space-y-3">
          <div className="relative mx-auto aspect-[3/4] w-full max-w-[520px] overflow-hidden rounded-xl bg-muted">
            <img key={n} src={publicUrl(slidePath(row.id, n))} alt={words ? `Slide ${n + 1}: ${words.slice(0, 200)}` : `Slide ${n + 1} of ${row.slides}`} className="h-full w-full object-contain" />
            {isVideo && <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">Video, still frame</span>}
          </div>
          <div className="mx-auto flex max-w-[520px] items-center justify-between">
            <Button variant="outline" size="icon" onClick={() => go(n - 1)} aria-label="Previous slide" disabled={row.slides < 2}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm tabular-nums text-muted-foreground" aria-live="polite">{n + 1} / {row.slides}</span>
            <Button variant="outline" size="icon" onClick={() => go(n + 1)} aria-label="Next slide" disabled={row.slides < 2}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </section>

        <section aria-label="About this carousel" className="space-y-5">
          <div className="space-y-1.5">
            <Link to={`/carousels?creator=${encodeURIComponent(row.creator)}`} className="text-sm font-semibold text-foreground hover:text-primary">@{row.creator}</Link>
            <p className="text-xs text-muted-foreground">
              {[row.topic, row.format, `Posted ${new Date(row.posted_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`].filter(Boolean).join(" · ")}
            </p>
            <h1 className="font-serif text-xl font-semibold leading-snug">{row.title || "Untitled"}</h1>
          </div>

          <div className="flex items-center gap-3">
            <span className={cn("rounded-lg px-2.5 py-1.5 text-lg font-bold tabular-nums", tier.className)}>{multipleLabel(row.multiple)}</span>
            <div className="text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Outlier score: {tier.label}</p>
              {row.baseline !== null && <p>Usual for this creator: {compact(row.baseline)} likes + comments</p>}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 border-y border-border/60 py-3 text-sm">
            <div>
              <dt className="flex items-center gap-1 text-xs text-muted-foreground"><Heart className="h-3 w-3" /> Likes</dt>
              <dd className="text-lg font-semibold tabular-nums">{row.likes.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-xs text-muted-foreground"><MessageCircle className="h-3 w-3" /> Comments</dt>
              <dd className="text-lg font-semibold tabular-nums">{row.comments.toLocaleString()}</dd>
            </div>
          </dl>

          <RemixButton size="lg" className="w-full" source={source} label={`Remix: @${row.creator}'s carousel`}>
            <Button size="lg" className="w-full gap-2" onClick={() => navigate(`/generate?carousel=${encodeURIComponent(row.id)}`)}>
              <Sparkles className="h-4 w-4" /> Make it your own <ArrowRight className="h-4 w-4" />
            </Button>
          </RemixButton>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={savedTo ? "secondary" : "outline"}
              size="sm"
              className="gap-1.5"
              aria-pressed={Boolean(savedTo)}
              onClick={() => {
                setShelf(toggleSaved(shelf, row.id, savedTo?.folder ?? null));
                toast({ title: savedTo ? "Removed from Saved" : "Saved" });
              }}
            >
              {savedTo ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />} {savedTo ? "Saved" : "Save"}
            </Button>
            {savedTo && shelf.folders.length > 0 && (
              <Select value={savedTo.folder ?? NO_FOLDER} onValueChange={(v) => setShelf(toggleSaved(shelf, row.id, v === NO_FOLDER ? null : v))}>
                <SelectTrigger className="h-9 w-[160px]" aria-label="Folder"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FOLDER}>No folder</SelectItem>
                  {shelf.folders.map((fo) => <SelectItem key={fo.id} value={fo.id}>{fo.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" aria-pressed={tracked} onClick={() => setShelf(toggleTracked(shelf, row.creator))}>
              {tracked ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />} {tracked ? `Tracking @${row.creator}` : `Track @${row.creator}`}
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a href={row.ig_url} target="_blank" rel="noopener noreferrer">
                Original post <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>

          <details className="rounded-lg border border-border/60 p-3 text-sm">
            <summary className="cursor-pointer font-medium">Words on each slide</summary>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted-foreground">
              {Array.from({ length: row.slides }, (_, i) => (
                <li key={i}>
                  <button type="button" className={cn("text-left hover:text-foreground", i === n && "text-foreground")} onClick={() => go(i)}>
                    {row.slide_text[i]?.replace(/\s+/g, " ").trim() || "No words on this slide"}
                  </button>
                </li>
              ))}
            </ol>
          </details>
          {row.caption && (
            <details className="rounded-lg border border-border/60 p-3 text-sm">
              <summary className="cursor-pointer font-medium">Caption</summary>
              <p className="mt-2 whitespace-pre-line text-muted-foreground">{row.caption}</p>
            </details>
          )}
          <p className="text-xs text-muted-foreground">@{row.creator} owns this post. Study how it works, then make your own.</p>
        </section>
      </div>

      <Related title="Same topic and format" rows={similar} back={back} saved={savedIds} onSave={onCardSave} more={row.topic ? `/carousels?topic=${encodeURIComponent(row.topic)}${row.format ? `&format=${encodeURIComponent(row.format)}` : ""}&sort=score` : undefined} />
      <Related title={`More from @${row.creator}`} rows={more} back={back} saved={savedIds} onSave={onCardSave} more={`/carousels?creator=${encodeURIComponent(row.creator)}&sort=score`} />
    </div>
  );
}

function Related({ title, rows, back, saved, onSave, more }: { title: string; rows: CarouselCard[]; back: string; saved: Set<string>; onSave: (e: MouseEvent, id: string) => void; more?: string }) {
  if (!rows.length) return null;
  return (
    <section className="space-y-3" aria-label={title}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        {more && <Link to={more} className="text-sm font-medium text-primary hover:underline">See all</Link>}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {rows.map((c) => <CarouselCardView key={c.id} c={c} back={back} saved={saved.has(c.id)} onSave={onSave} />)}
      </div>
    </section>
  );
}
