import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import CopyLinkButton from "@/components/CopyLinkButton";
import { links } from "@/lib/links";
import { useUrlItem } from "@/lib/urlState";
import { supabase } from "@/lib/supabase";
import { ACADEMY, type AcademyLesson } from "@/data/academy";
import { ArrowRight, GraduationCap, Play, CheckCircle2, Circle } from "lucide-react";

const KEY_PREFIX = "content-studio-academy-";

function loadWatched(userId: string | null): string[] {
  if (!userId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`${KEY_PREFIX}${userId}`);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveWatched(userId: string, ids: string[]): void {
  try {
    window.localStorage.setItem(`${KEY_PREFIX}${userId}`, JSON.stringify(ids));
  } catch (_) {
    /* ignore */
  }
}

const ALL_LESSONS: AcademyLesson[] = ACADEMY.flatMap((m) => m.lessons);
const ALL_IDS = ALL_LESSONS.map((l) => l.youtubeId);
const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export default function AcademyPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [watched, setWatched] = useState<string[]>([]);
  // Up next waits for this account's progress, so it never flashes lesson 1 at someone halfway through
  const [ready, setReady] = useState(false);
  // ?lesson=<YouTube id> opens and plays a lesson (docs/deep-links.md); Back closes it.
  const [lessonParam, setPlaying] = useUrlItem("lesson");
  const playing = lessonParam && ALL_IDS.includes(lessonParam) ? lessonParam : null;

  useEffect(() => {
    document.title = "Academy - Postmosis";
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      setWatched(loadWatched(id));
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // A lesson link lands on its card (only on arrival: a tap in the page is already looking at it).
  useEffect(() => {
    if (playing) document.getElementById(`lesson-${playing}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleWatched = (id: string) => {
    setWatched((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      if (userId) saveWatched(userId, next);
      return next;
    });
  };

  const doneCount = useMemo(
    () => watched.filter((id) => ALL_IDS.includes(id)).length,
    [watched],
  );
  const overallPct = Math.round((doneCount / ALL_IDS.length) * 100);
  const next = ALL_LESSONS.find((l) => !watched.includes(l.youtubeId)) ?? null;

  // Playing marks the lesson watched; a play from Up next also scrolls to the lesson's own row.
  const play = (id: string, scroll = false) => {
    setPlaying(id);
    if (!watched.includes(id)) toggleWatched(id);
    if (scroll) requestAnimationFrame(() => document.getElementById(`lesson-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          <GraduationCap className="h-6 w-6 text-primary" /> Academy
        </h1>
        <div className="max-w-md space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              Your progress
              <InfoTip label="About your progress">
                Playing a lesson marks it watched, and progress saves automatically.
              </InfoTip>
            </span>
            <span className="font-semibold text-foreground">
              {doneCount} / {ALL_IDS.length} lessons
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-primary transition-all duration-500"
              style={{ width: `${overallPct}%` }}
            />
          </div>
        </div>
      </header>

      {ready &&
        (next ? (
          <Card className="flex items-center gap-3 border-primary/30 bg-primary/5 p-3 shadow-card sm:gap-4">
            <img src={thumb(next.youtubeId)} alt="" className="aspect-video w-28 shrink-0 rounded-md object-cover sm:w-36" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">{doneCount ? "Up next" : "Start here"}</p>
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{next.title}</p>
              <p className="text-xs text-muted-foreground">{next.channel}</p>
            </div>
            <Button onClick={() => play(next.youtubeId, true)} className="shrink-0 gap-1.5">
              <Play className="h-3.5 w-3.5 fill-current" /> Play
            </Button>
          </Card>
        ) : (
          <Card className="flex flex-wrap items-center gap-3 border-success/30 bg-success/5 p-4 shadow-card">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
            <p className="min-w-0 flex-1 text-sm font-semibold text-foreground">All {ALL_IDS.length} lessons watched</p>
            <Button asChild>
              <Link to="/generate">Write a post</Link>
            </Button>
          </Card>
        ))}

      {ACADEMY.map((mod) => {
        const modDone = mod.lessons.filter((l) =>
          watched.includes(l.youtubeId),
        ).length;
        return (
          <section key={mod.title} className="space-y-3">
            <div className="space-y-0.5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-1.5 font-serif text-lg font-semibold text-foreground">
                  {modDone === mod.lessons.length && <CheckCircle2 className="h-4 w-4 text-success" aria-label="Module done" />}
                  {mod.title}
                </h2>
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  {modDone}/{mod.lessons.length} done
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {mod.blurb}{" "}
                <Link
                  to={mod.studio.to}
                  title="Do it in the studio"
                  className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11"
                >
                  {mod.studio.label} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </p>
            </div>

            <div className="space-y-2">
              {mod.lessons.map((lesson) => {
                const isWatched = watched.includes(lesson.youtubeId);
                const isPlaying = playing === lesson.youtubeId;
                return (
                  <Card
                    key={lesson.youtubeId}
                    id={`lesson-${lesson.youtubeId}`}
                    className="scroll-mt-20 overflow-hidden border-border/60 shadow-card"
                  >
                    {isPlaying && (
                      <div className="aspect-video bg-muted">
                        <iframe
                          className="h-full w-full"
                          src={`https://www.youtube-nocookie.com/embed/${lesson.youtubeId}?autoplay=1&rel=0`}
                          title={lesson.title}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    )}
                    <div className="flex gap-3 p-3 sm:gap-4">
                      {!isPlaying && (
                        <button
                          type="button"
                          onClick={() => play(lesson.youtubeId)}
                          className="group relative aspect-video w-28 shrink-0 self-start overflow-hidden rounded-md bg-muted sm:w-44"
                          aria-label={`Play: ${lesson.title}`}
                        >
                          <img src={thumb(lesson.youtubeId)} alt="" loading="lazy" className="h-full w-full object-cover" />
                          <span className="absolute inset-0 flex items-center justify-center bg-foreground/10 transition-colors group-hover:bg-foreground/30">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-primary shadow-lg">
                              <Play className="ml-0.5 h-4 w-4 fill-current" />
                            </span>
                          </span>
                        </button>
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-semibold leading-snug text-foreground">{lesson.title}</p>
                        <p className="text-xs text-muted-foreground">{lesson.channel}</p>
                        <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{lesson.why}</p>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => toggleWatched(lesson.youtubeId)}
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold [@media(pointer:coarse)]:min-h-11 ${
                              isWatched ? "text-success" : "text-muted-foreground"
                            }`}
                          >
                            {isWatched ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                            {isWatched ? "Watched" : "Mark watched"}
                          </button>
                          <CopyLinkButton path={links.academy({ lesson: lesson.youtubeId })} label={`Copy link to ${lesson.title}`} className="-my-2 -mr-2" />
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
