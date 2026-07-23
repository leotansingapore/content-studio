import { useEffect, useState } from "react";
import SectionTabs, { PLAYBOOK_TABS } from "@/components/SectionTabs";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import {
  loadPositioning,
  isPositioningUsable,
  type Positioning,
} from "@/lib/positioning";
import { loadVoiceProfile, isVoiceProfileUsable } from "@/lib/voiceProfile";
import { loadSaved, type SavedItems } from "@/lib/savedItems";
import inspirationData from "@/data/inspiration.json";
import advisorsData from "@/data/advisors.json";
import {
  Target,
  Mic,
  Lightbulb,
  Users as UsersIcon,
  CheckCircle2,
  ArrowRight,
  Bookmark,
} from "lucide-react";

type Insp = { id: string; hook: string; topic: string };
type Adv = { id: string; name: string; handle: string };

const INSP = inspirationData as Insp[];
const ADV = advisorsData as Adv[];

const AUDIENCE_LABEL: Record<string, string> = {
  "young-adult": "Young adults",
  "working-adult": "Working adults",
  parent: "Parents",
  "pre-retiree": "Pre-retirees",
  general: "General",
};

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
  const [positioning, setPositioning] = useState<Positioning | null>(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const [saved, setSaved] = useState<SavedItems>({
    inspiration: [],
    creators: [],
  });

  useEffect(() => {
    document.title = "My Playbook - Content Studio";
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      const id = data.user?.id ?? null;
      setPositioning(loadPositioning(id));
      setVoiceReady(isVoiceProfileUsable(loadVoiceProfile(id)));
      setSaved(loadSaved(id));
    })();
    return () => {
      active = false;
    };
  }, []);

  const hasPositioning = isPositioningUsable(positioning);
  const savedInsp = saved.inspiration
    .map((id) => INSP.find((e) => e.id === id))
    .filter(Boolean) as Insp[];
  const savedAdv = saved.creators
    .map((id) => ADV.find((a) => a.id === id))
    .filter(Boolean) as Adv[];

  return (
    <div className="space-y-6">
      <SectionTabs tabs={PLAYBOOK_TABS} />
      <header className="space-y-1.5">
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          My Playbook
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Your content strategy in one place: who you're for, how you sound, and
          the examples and creators you've saved. Come back here whenever you're
          not sure what to post.
        </p>
      </header>

      {/* Positioning */}
      <SectionCard
        icon={Target}
        title="Your positioning"
        action={
          <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
            <Link to="/plan">{hasPositioning ? "Edit" : "Set it up"}</Link>
          </Button>
        }
      >
        {hasPositioning && positioning ? (
          <div className="space-y-3">
            {positioning.oneLiner && (
              <p className="font-serif text-lg leading-snug text-foreground">
                &ldquo;{positioning.oneLiner}&rdquo;
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {AUDIENCE_LABEL[positioning.audience] ?? positioning.audience}
              </span>
              {positioning.audienceDetail && (
                <span className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground">
                  {positioning.audienceDetail}
                </span>
              )}
              <span className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground">
                {positioning.cadence} posts/week
              </span>
            </div>
            {positioning.topics.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Topics you teach
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {positioning.topics.map((t) => (
                    <span
                      key={t}
                      className="rounded-md border border-border/60 bg-background px-2 py-0.5 text-xs text-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {positioning.edge && (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Your edge
                </p>
                <p className="text-sm text-foreground/90">{positioning.edge}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            You haven't set your positioning yet. Define who you serve and your
            edge in{" "}
            <Link to="/plan" className="font-semibold text-primary hover:underline">
              Plan
            </Link>{" "}
            — it makes every draft sharper.
          </p>
        )}
      </SectionCard>

      {/* Voice */}
      <SectionCard
        icon={Mic}
        title="Your voice"
        action={
          <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
            <Link to="/voice">{voiceReady ? "Edit" : "Set it up"}</Link>
          </Button>
        }
      >
        {voiceReady ? (
          <p className="flex items-center gap-2 text-sm text-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" /> Your voice profile
            is active — drafts are steered toward how you actually write.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No voice profile yet. Paste a few past posts in{" "}
            <Link to="/voice" className="font-semibold text-primary hover:underline">
              Voice
            </Link>{" "}
            so drafts sound like you, not generic AI.
          </p>
        )}
      </SectionCard>

      {/* Saved */}
      <div className="grid gap-4 md:grid-cols-2">
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
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild className="gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95">
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
