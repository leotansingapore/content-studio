// Versions of this carousel in Chinese, Malay and Tamil (edit-translate), under the slides on /carousel, Leo only
// (CarouselPage mounts it). The English carousel offers "Make it in" and lists its versions; a version links back
// and shows its English meaning. The call runs in translateJob.ts, so leaving the page keeps it going.
// CarouselPage reads ?carousel= only on load, so every link here is a full page load.

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Languages } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import PriceChip from "@/components/PriceChip";
import { Ask, MeaningRows, useTranslateJob } from "@/components/TranslateBar";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import { loadCarousels, saveCarousel, type SavedCarousel } from "@/lib/carousel";
import { scanCompliance } from "@/lib/compliance";
import { links, type PostLang } from "@/lib/links";
import { reasonText } from "@/lib/prices";
import { LANG_NAMES, sameWarns } from "@/lib/translate";
import { ackJob, carouselLines, carouselMeaning, carouselsFull, LANGS, translateCarousel } from "@/lib/translateJob";
import { useUrlItem } from "@/lib/urlState";

const href = (id: string) => links.carousel({ carousel: id });
const chip = "inline-flex h-11 items-center rounded-full border border-border/70 px-3 text-xs font-medium text-muted-foreground hover:text-foreground sm:h-9";
const linkButton = "-my-2 py-2 font-semibold text-primary hover:underline";

/** carousel is the one on screen, as saveCarousel takes it: its id is what a version's translationOf points at. */
export default function CarouselVersions({ userId, carousel }: { userId: string; carousel: Omit<SavedCarousel, "updatedAt"> }) {
  const { toast } = useToast();
  const [meaning, openMeaning, closeMeaning] = useUrlItem("meaning");
  const [ask, setAsk] = useState<PostLang | null>(null);
  const job = useTranslateJob(carousel.id);
  const running = job?.state === "running";
  const left = useUsesLeft(running)("post-translate");
  const all = loadCarousels(userId);
  const stored = all.find((c) => c.id === carousel.id);

  // A version keeps its language and link: CarouselPage's save rewrites the carousel without them, so put them back
  // once its save has run (800 ms after an edit). shortcut: a tab closed in that window drops them; fix keep() to carry them.
  const kept = useRef<Pick<SavedCarousel, "lang" | "translationOf"> & { id: string }>();
  if (stored?.lang && kept.current?.id !== stored.id) kept.current = { id: stored.id, lang: stored.lang, translationOf: stored.translationOf };
  useEffect(() => {
    const t = window.setTimeout(() => {
      const k = kept.current;
      const now = k?.id === carousel.id ? loadCarousels(userId).find((c) => c.id === k.id) : null;
      if (!k || !now || now.lang) return;
      const { updatedAt, ...rest } = now;
      saveCarousel(userId, { ...rest, lang: k.lang, ...(k.translationOf ? { translationOf: k.translationOf } : {}) }, new Date(updatedAt || Date.now()));
    }, 1500);
    return () => window.clearTimeout(t);
  }, [carousel, userId]);

  // a job that finishes here is shown once; one that finished while the page was closed is in the Saved tab already
  const mountedAt = useRef(Date.now());
  useEffect(() => {
    if (!job || job.state === "running") return;
    if (job.at < mountedAt.current) return ackJob(job);
    if (job.state === "failed") return;
    ackJob(job);
    const id = job.versionId;
    if (!id) return;
    toast({
      title: `${LANG_NAMES[job.lang]} version saved.`,
      action: (
        <ToastAction altText="Open it" onClick={() => window.location.assign(href(id))}>
          Open it
        </ToastAction>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  const lang = stored?.lang ?? (kept.current?.id === carousel.id ? kept.current.lang : undefined);
  if (lang) {
    const fromId = stored?.translationOf?.id ?? kept.current?.translationOf?.id;
    const english = fromId ? all.find((c) => c.id === fromId) : undefined;
    const m = carouselMeaning(userId, carousel.id);
    const flags = m ? scanCompliance(m.back.join("\n")) : [];
    return (
      <div className="space-y-2 border-t border-border/60 pt-3 text-xs" data-testid="carousel-versions">
        {english && (
          <p className="text-muted-foreground">
            {LANG_NAMES[lang]} version of:{" "}
            <a href={href(english.id)} className={linkButton}>
              "{english.title}"
            </a>
          </p>
        )}
        {m && sameWarns(m.same) && (
          <p role="status" className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Check this version: it may say something the English doesn't.
          </p>
        )}
        {flags.map((f) => (
          <p key={f.id} role="status" className="flex items-start gap-1.5 font-medium text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              In English this says "{f.match}". {f.message}
            </span>
          </p>
        ))}
        <p className="flex flex-wrap items-center gap-x-3 text-muted-foreground">
          Checks run on the English version.
          {m && (
            <button type="button" aria-expanded={meaning === "1"} onClick={() => (meaning === "1" ? closeMeaning() : openMeaning("1"))} className={linkButton}>
              {meaning === "1" ? "Hide the English meaning" : "Show the English meaning"}
            </button>
          )}
        </p>
        {m && meaning === "1" && <MeaningRows lines={carouselLines(carousel.slides)} back={m.back} />}
      </div>
    );
  }

  const versions = all.filter((c) => c.lang && c.translationOf?.id === carousel.id).sort((a, b) => LANGS.indexOf(a.lang!) - LANGS.indexOf(b.lang!));
  const missing = LANGS.filter((l) => !versions.some((v) => v.lang === l));
  const start = (l: PostLang) => {
    setAsk(null);
    void translateCarousel(userId, carousel, l);
  };
  const busy = running ? job?.lang : null;
  const why = reasonText({ left, leo: true });
  return (
    <div className="space-y-2 border-t border-border/60 pt-3" data-testid="carousel-versions">
      {versions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-muted-foreground">Versions:</span>
          {versions.map((v) => (
            <a key={v.id} href={href(v.id)} className={chip}>
              {LANG_NAMES[v.lang!]}
            </a>
          ))}
        </div>
      )}
      {missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
            <Languages className="h-3.5 w-3.5" /> Make it in
          </span>
          {missing.map((l) => (
            <Button
              key={l}
              variant="outline"
              size="sm"
              disabled={running || left === 0}
              onClick={() => (carouselsFull(userId) ? setAsk(l) : start(l))}
              className={`h-11 gap-1.5 sm:h-9 ${busy === l ? "disabled:opacity-100" : ""}`}
            >
              {busy === l && <ThinkingOrb state="working" size={20} theme="light" aria-hidden />}
              {busy === l ? "Translating..." : LANG_NAMES[l]}
            </Button>
          ))}
          {!running && <PriceChip feature="post-translate" left={left} />}
          {why && <p className="basis-full text-xs text-destructive">{why}</p>}
        </div>
      )}
      {ask && (
        <Ask onYes={() => start(ask)} onNo={() => setAsk(null)}>
          Your carousels hold 20. Saving this drops your oldest one.
        </Ask>
      )}
      {job?.state === "failed" && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {job.error}
        </p>
      )}
    </div>
  );
}
