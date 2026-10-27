// What runs without you (/automations, Leo's sign-ins only; docs/north-star/items/agent-autonomy.md, read through
// phase6-build-brief.md): the agent's one switch (moving a post, autonomy.ts), what already runs without a press and
// where each is changed, and today's daily limits. Scheduled skills wait for a server job (the brief's Q4), so there
// is no Schedule a skill button. #alone, #runs and #limits scroll to their section. Everyone else gets the 404 page.

import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { readUsage, usesLeft, type Usage } from "@/lib/aiUsage";
import { AUTOPILOT_CHANGED, loadAutopilot } from "@/lib/autopilot";
import { AUTONOMY_CHANGED, SHADOW_CHANGED, loadAutonomy, loadShadow, saveAutonomy, type Autonomy } from "@/lib/autonomy";
import { loadIdeas, onIdeasChanged } from "@/lib/ideasInbox";
import { links } from "@/lib/links";
import { loadNotifyPrefs, pushOnHere, saveNotifyPrefs } from "@/lib/notify";
import { socialConnectShown } from "@/lib/socialConnect";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useScrollToHash } from "@/lib/urlState";
import { cn } from "@/lib/utils";
import NotFoundPage from "@/pages/NotFoundPage";
import { DAILY_LIMITS, type UsageFeature } from "../../supabase/functions/_shared/usageCaps.ts";

const HEAD = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const CARD = "divide-y divide-border/60 rounded-xl border border-border/60 bg-card shadow-card";
const LINK = "inline-flex min-h-11 items-center gap-0.5 text-sm font-semibold text-primary hover:underline";
const MOVE: { id: Autonomy["changes"]; label: string }[] = [
  { id: "ask", label: "Ask me first" },
  { id: "auto", label: "Do it, then tell me" },
];
const LIMITS: { feature: UsageFeature; label: string }[] = [
  { feature: "agent-act", label: "Agent messages" },
  { feature: "ai-image", label: "Pictures" },
  { feature: "ai-video", label: "AI videos" },
  { feature: "ai-voice", label: "Voiceovers" },
];
const shortDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

export default function AutomationsPage() {
  const leo = useLeoUser();
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage notOnAccount />;
  return <Automations userId={leo.id} />;
}

function Automations({ userId }: { userId: string }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    // "storage" covers My Playbook's email switch changed in another tab
    const events = [AUTONOMY_CHANGED, SHADOW_CHANGED, AUTOPILOT_CHANGED, "storage"];
    events.forEach((e) => window.addEventListener(e, redraw));
    const offIdeas = onIdeasChanged(redraw);
    return () => {
      events.forEach((e) => window.removeEventListener(e, redraw));
      offIdeas();
    };
  }, []);

  // undefined while reading, null when it can't be read
  const [usage, setUsage] = useState<Usage | null | undefined>(undefined);
  const [pushHere, setPushHere] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    readUsage().then(
      (u) => live && setUsage(u),
      () => live && setUsage(null),
    );
    void pushOnHere().then((on) => live && setPushHere(on));
    return () => {
      live = false;
    };
  }, []);
  useScrollToHash();

  // "Saved." (or the save error) beside the control just changed, for 2 seconds
  const [saved, setSaved] = useState<{ row: string; line: string } | null>(null);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const showSaved = (row: string, error: string | null) => {
    window.clearTimeout(timer.current);
    setSaved({ row, line: error ?? "Saved." });
    timer.current = window.setTimeout(() => setSaved(null), 2000);
  };
  const savedFor = (row: string) => (
    <span role="status" className={cn("w-12 shrink-0 text-right text-xs", saved?.row === row && saved.line !== "Saved." ? "w-auto font-medium text-destructive" : "text-muted-foreground")}>
      {saved?.row === row ? saved.line : ""}
    </span>
  );

  const changes = loadAutonomy(userId).changes;
  const shadow = loadShadow(userId);
  const prefs = loadNotifyPrefs(userId);
  const autopilotOn = loadAutopilot(userId).settings.on;
  const morning = loadIdeas(userId).morning;

  const setChanges = (c: Autonomy["changes"]) => {
    const error = c === changes ? null : saveAutonomy(userId, { changes: c });
    redraw();
    showSaved("move", error);
  };
  const setEmail = (email: boolean) => {
    // exactly as My Playbook's switch writes it (NotifySettings.tsx)
    saveNotifyPrefs(userId, { ...loadNotifyPrefs(userId), email });
    redraw();
    showSaved("email", null);
  };

  return (
    <div className="space-y-8">
      <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">What runs without you</h1>

      <Section id="alone" title="What the agent does alone">
        <Row
          label="Moving or scheduling a post"
          sub={`Skips the card only when it's sure of the post and the day. Two weeks of your card answers set how sure: ${
            shadow.length ? `${shadow.length} since ${shortDay(shadow[shadow.length - 1].at)}` : "none yet"
          }.`}
        >
          {savedFor("move")}
          <div role="radiogroup" aria-label="Moving or scheduling a post" className="inline-flex shrink-0 rounded-lg bg-muted p-0.5">
            {MOVE.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={changes === o.id}
                onClick={() => setChanges(o.id)}
                className={cn(
                  "min-h-11 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors",
                  changes === o.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Videos and voiceovers">
          <p className="text-sm text-muted-foreground">Always wait for your yes.</p>
        </Row>
        <Row label="Posting">
          <p className="text-sm text-muted-foreground">Nothing posts without your yes.</p>
        </Row>
      </Section>

      <Section id="runs" title="What runs now" foot="Skills on a schedule are not built yet.">
        <Row label="Monday results email" sub="Mondays, 8am">
          {savedFor("email")}
          <Switch label="Monday results email" checked={prefs.email} onChange={setEmail} />
        </Row>
        <Row label="Phone alerts" sub={!prefs.push ? "Off" : pushHere === null ? "\u00a0" : pushHere ? "On for this device" : "Off"}>
          <Go to={links.playbook()}>Change in My Playbook</Go>
        </Row>
        <Row label="Autopilot" sub={autopilotOn ? "On. Writes when you open the app." : "Off"}>
          <Go to={links.plan({ section: "autopilot" })}>Change on Plan</Go>
        </Row>
        <Row label="Today's ideas" sub={morning ? "On. Written when you open the app." : "Off"}>
          <Go to={links.ideas()}>Change on Ideas</Go>
        </Row>
        {socialConnectShown() && (
          <Row label="Auto-DM" sub="Replies to keyword comments for you.">
            <Go to={links.autoDm()}>Change in Auto-DM</Go>
          </Row>
        )}
      </Section>

      <Section id="limits" title="Daily limits" foot="Limits reset at 8am Singapore time.">
        {LIMITS.map((l) => {
          const left = usage ? usesLeft(usage, l.feature) : null;
          return (
            <Row key={l.feature} label={l.label}>
              {usage === undefined ? (
                <span aria-hidden className="h-4 w-32 animate-pulse rounded bg-muted" />
              ) : (
                <span className="text-sm tabular-nums text-muted-foreground">{left === null ? "-" : `${left} of ${DAILY_LIMITS[l.feature]} left today`}</span>
              )}
            </Row>
          );
        })}
      </Section>
    </div>
  );
}

function Section({ id, title, foot, children }: { id: string; title: string; foot?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 space-y-2">
      <h2 id={`${id}-h`} className={cn(HEAD, "px-1")}>
        {title}
      </h2>
      <div className={CARD}>{children}</div>
      {foot && <p className="px-1 text-xs text-muted-foreground">{foot}</p>}
    </section>
  );
}

function Row({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1 basis-40">
        <p className="text-sm font-medium">{label}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}

function Go({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className={LINK}>
      {children}
      <ChevronRight aria-hidden className="h-4 w-4" />
    </Link>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex h-11 w-14 shrink-0 items-center justify-end rounded-lg"
    >
      <span aria-hidden className={cn("relative inline-flex h-6 w-11 rounded-full transition-colors", checked ? "bg-primary" : "bg-muted-foreground/30")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
      </span>
    </button>
  );
}
