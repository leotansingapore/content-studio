import { useEffect, useMemo, useState } from "react";
import SectionTabs, { LEARN_TABS } from "@/components/SectionTabs";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { ACADEMY } from "@/data/academy";
import { GraduationCap, Play, CheckCircle2, Circle } from "lucide-react";

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

const ALL_IDS = ACADEMY.flatMap((m) => m.lessons.map((l) => l.youtubeId));

export default function AcademyPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [watched, setWatched] = useState<string[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Academy - Content Studio";
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      setWatched(loadWatched(id));
    });
    return () => {
      active = false;
    };
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

  return (
    <div className="space-y-6">
      <SectionTabs tabs={LEARN_TABS} />
      <header className="space-y-3">
        <div className="space-y-1.5">
          <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
            <GraduationCap className="h-6 w-6 text-primary" /> Academy
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            A short course on creating great content with AI — custom GPTs,
            carousels, brand voice, and a system to keep it going. Work through
            it at your own pace; your progress saves automatically.
          </p>
        </div>
        <div className="max-w-md space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Your progress</span>
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

      {ACADEMY.map((mod) => {
        const modDone = mod.lessons.filter((l) =>
          watched.includes(l.youtubeId),
        ).length;
        return (
          <section key={mod.title} className="space-y-3">
            <div className="space-y-0.5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-serif text-lg font-semibold text-foreground">
                  {mod.title}
                </h2>
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  {modDone}/{mod.lessons.length} done
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{mod.blurb}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {mod.lessons.map((lesson) => {
                const isWatched = watched.includes(lesson.youtubeId);
                const isPlaying = playing === lesson.youtubeId;
                return (
                  <Card
                    key={lesson.youtubeId}
                    className="overflow-hidden border-border/60 shadow-card"
                  >
                    <div className="relative aspect-video bg-muted">
                      {isPlaying ? (
                        <iframe
                          className="h-full w-full"
                          src={`https://www.youtube-nocookie.com/embed/${lesson.youtubeId}?autoplay=1&rel=0`}
                          title={lesson.title}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setPlaying(lesson.youtubeId);
                            if (!isWatched) toggleWatched(lesson.youtubeId);
                          }}
                          className="group relative block h-full w-full"
                          aria-label={`Play: ${lesson.title}`}
                        >
                          <img
                            src={`https://i.ytimg.com/vi/${lesson.youtubeId}/hqdefault.jpg`}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                          <span className="absolute inset-0 flex items-center justify-center bg-foreground/20 transition-colors group-hover:bg-foreground/30">
                            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-background/90 text-primary shadow-lg">
                              <Play className="ml-0.5 h-5 w-5 fill-current" />
                            </span>
                          </span>
                        </button>
                      )}
                    </div>
                    <CardContent className="space-y-2 py-3">
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold leading-snug text-foreground">
                          {lesson.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {lesson.channel}
                        </p>
                      </div>
                      <p className="text-xs leading-snug text-muted-foreground">
                        {lesson.why}
                      </p>
                      <button
                        type="button"
                        onClick={() => toggleWatched(lesson.youtubeId)}
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                          isWatched ? "text-success" : "text-muted-foreground"
                        }`}
                      >
                        {isWatched ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <Circle className="h-3.5 w-3.5" />
                        )}
                        {isWatched ? "Watched" : "Mark watched"}
                      </button>
                    </CardContent>
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
