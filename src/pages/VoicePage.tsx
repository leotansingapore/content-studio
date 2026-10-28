import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import PriceChip from "@/components/PriceChip";
import { supabase } from "@/lib/supabase";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useGoneItem, useScrollToHash, useScrollToItem, useUrlItem } from "@/lib/urlState";
import { links } from "@/lib/links";
import { WRITE_PRICE } from "@/lib/prices";
import { auditedHandles, captionsForVoice, loadAuditFor } from "@/lib/accountAudit";
import { loadSocialAccounts } from "@/lib/socialAccounts";
import { loadCoachProfile, removePreference, saveCoachProfile } from "@/lib/coachProfile";
import { REWRITE_LEARNINGS, isLoggedRewrite } from "@/lib/rewriteLog";
import {
  FACT_CHARS,
  LEARNING_CHARS,
  LEARNING_SCOPES,
  MAX_FACTS,
  MAX_LEARNINGS,
  activeLearnings,
  addFact,
  addLearning,
  fullLine,
  isOn,
  loadFacts,
  loadLearnings,
  onMemoryChanged,
  setFactOff,
  setLearningOff,
  type Learning,
  type LearningScope,
} from "@/lib/voiceMemory";
import {
  Save,
  RefreshCw,
  Loader2,
  Sparkles,
  Check,
  ArrowLeft,
  X,
} from "lucide-react";
import { scoped } from "@/lib/profiles";
import {
  loadVoiceProfile,
  saveVoiceProfile,
  VOICE_MAX_SLOTS,
  VOICE_MIN_CHARS,
  VOICE_MIN_FILLED,
  type VoiceProfile,
} from "@/lib/voiceProfile";
import { professionFor } from "@/lib/profession";
import { adviserBrand } from "@/lib/profession";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "https://hgdbflprrficdoyxmdxe.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnZGJmbHBycmZpY2RveXhtZHhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE3NjY0NDAsImV4cCI6MjA2NzM0MjQ0MH0.2qwUbh0nkFyOLzzZgXk7bedINzHSf2ULMBUECOqWmIw";

const SLOT_INDICES = Array.from({ length: VOICE_MAX_SLOTS }, (_, i) => i);

// Posts pasted but not saved yet, kept for this tab so leaving the page (to
// check a draft, copy another post) doesn't throw them away. sessionStorage,
// outside the synced prefix: it is scratch until Save.
const workKey = (userId: string) => `cs-voice-work-${scoped(userId)}`;

export default function VoicePage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [posts, setPosts] = useState<string[]>(
    Array.from({ length: VOICE_MAX_SLOTS }, () => ""),
  );
  const [voiceSummary, setVoiceSummary] = useState<string>("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [distilling, setDistilling] = useState(false);
  // Leo only (brand-voice-memory): the summary is editable, and a hand edit is dated so Re-distill asks first
  const leo = useLeoUser();
  const [summaryEditedAt, setSummaryEditedAt] = useState<string | undefined>(undefined);
  useScrollToHash(!!leo && !!userId);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      const profile = loadVoiceProfile(id);
      if (profile) {
        const filled = [...profile.posts];
        while (filled.length < VOICE_MAX_SLOTS) filled.push("");
        setPosts(filled.slice(0, VOICE_MAX_SLOTS));
        setVoiceSummary(profile.voiceSummary ?? "");
        setUpdatedAt(profile.updatedAt ?? null);
        setSummaryEditedAt(profile.summaryEditedAt);
      }
      try {
        const work = id ? JSON.parse(sessionStorage.getItem(workKey(id)) ?? "null") : null;
        if (Array.isArray(work) && work.every((w) => typeof w === "string")) {
          const restored = work.slice(0, VOICE_MAX_SLOTS);
          while (restored.length < VOICE_MAX_SLOTS) restored.push("");
          setPosts(restored);
        }
      } catch {
        // corrupt or blocked storage: show the saved posts
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Kept while the posts differ from the saved profile; Save clears it.
  useEffect(() => {
    if (!userId) return;
    const saved = loadVoiceProfile(userId)?.posts ?? [];
    const same = posts.every((p, i) => p === (saved[i] ?? ""));
    try {
      if (same) sessionStorage.removeItem(workKey(userId));
      else sessionStorage.setItem(workKey(userId), JSON.stringify(posts));
    } catch {
      // storage blocked: unsaved posts just won't survive a page change
    }
  }, [userId, posts, updatedAt]);

  const filledCount = useMemo(
    () => posts.filter((p) => p.trim().length >= VOICE_MIN_CHARS).length,
    [posts],
  );

  const canDistill = filledCount >= VOICE_MIN_FILLED;

  const handlePostChange = (idx: number, value: string) => {
    setPosts((prev) => prev.map((p, i) => (i === idx ? value : p)));
  };

  const persistOnly = (summary?: string) => {
    if (!userId) return;
    const next: VoiceProfile = {
      posts,
      voiceSummary: summary ?? voiceSummary,
      updatedAt: new Date().toISOString(),
      // only Leo's hand edits set it, so everyone else's saved profile is unchanged
      ...(summaryEditedAt && summary === undefined ? { summaryEditedAt } : {}),
    };
    saveVoiceProfile(userId, next);
    setUpdatedAt(next.updatedAt);
  };

  const handleSave = async () => {
    if (!userId) {
      toast({
        title: "Not signed in",
        description: "Sign in again to save your voice profile.",
        variant: "destructive",
      });
      return;
    }
    if (!canDistill) {
      // Still save the raw posts, but skip distill. Leo keeps the saved summary (a website voice has no posts).
      persistOnly(leo ? undefined : "");
      toast({
        title: "Saved (not enough posts to distill yet)",
        description: `Add at least ${VOICE_MIN_FILLED} posts of ${VOICE_MIN_CHARS}+ chars to generate a voice summary.`,
      });
      return;
    }
    await runDistill();
  };

  const runDistill = async () => {
    if (!userId) return;
    setDistilling(true);
    try {
      const filled = posts
        .map((p) => p.trim())
        .filter((p) => p.length >= VOICE_MIN_CHARS);
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token ?? SUPABASE_ANON_KEY;
      const url = `${SUPABASE_URL}/functions/v1/generate-social-content`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ mode: "voice-summary", posts: filled, profession: professionFor(userId) || undefined }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`voice-summary failed (${res.status}) ${text}`);
      }
      const data = (await res.json()) as { voiceSummary?: string; error?: string };
      if (data.error) throw new Error(data.error);
      const summary = (data.voiceSummary ?? "").trim();
      setVoiceSummary(summary);
      setSummaryEditedAt(undefined);
      const next: VoiceProfile = {
        posts,
        voiceSummary: summary,
        updatedAt: new Date().toISOString(),
      };
      saveVoiceProfile(userId, next);
      setUpdatedAt(next.updatedAt);
      toast({
        title: "Voice saved",
        description:
          "Your voice profile will now steer every future generation toward your tone.",
      });
    } catch (err) {
      console.error(err);
      // Still save raw posts so they aren't lost.
      persistOnly();
      toast({
        title: "Couldn't distill voice",
        description:
          err instanceof Error
            ? err.message
            : "Saved the raw posts. Try distilling again in a moment.",
        variant: "destructive",
      });
    } finally {
      setDistilling(false);
    }
  };

  if (leo) {
    return (
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">Your voice</h1>
          <Link to="/generate" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary [@media(pointer:coarse)]:min-h-11">
            <ArrowLeft className="h-3 w-3" /> Skip for now
          </Link>
        </header>
        {userId ? (
          <>
            <HowYouSound
              userId={userId}
              posts={posts}
              setPosts={setPosts}
              filledCount={filledCount}
              canDistill={canDistill}
              distilling={distilling}
              updatedAt={updatedAt}
              summary={voiceSummary}
              setSummary={setVoiceSummary}
              editedAt={summaryEditedAt}
              setEditedAt={setSummaryEditedAt}
              setUpdatedAt={setUpdatedAt}
              save={handleSave}
              keepMine={() => (persistOnly(), toast({ title: "Saved. Your summary stays as you wrote it." }))}
              distill={runDistill}
            />
            <FactsSection userId={userId} />
            <LearnedSection userId={userId} />
          </>
        ) : (
          <div className="h-64 animate-pulse rounded-xl bg-muted/40" aria-label="Loading" />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
            Your voice
          </h1>
          <InfoTip label="About your voice">
            We turn these posts into a summary that steers every draft.
          </InfoTip>
        </div>
        <Link
          to="/generate"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary [@media(pointer:coarse)]:min-h-11"
        >
          <ArrowLeft className="h-3 w-3" /> Skip for now
        </Link>
      </header>

      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            Your past posts
          </CardTitle>
          <CardDescription>
            At least {VOICE_MIN_FILLED} slots filled with {VOICE_MIN_CHARS}+
            chars each. The rawer the better - paste verbatim from LinkedIn /
            IG / FB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {SLOT_INDICES.map((i) => {
            const text = posts[i] ?? "";
            const len = text.trim().length;
            const ready = len >= VOICE_MIN_CHARS;
            return (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`past-post-${i + 1}`}>
                    Past post {i + 1}
                  </Label>
                  <span
                    className={`text-[11px] ${
                      ready ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {ready ? (
                      <span className="inline-flex items-center gap-1">
                        <Check className="h-3 w-3" /> {len} chars
                      </span>
                    ) : (
                      <>
                        {len} / {VOICE_MIN_CHARS} chars
                      </>
                    )}
                  </span>
                </div>
                <Textarea
                  id={`past-post-${i + 1}`}
                  value={text}
                  onChange={(e) => handlePostChange(i, e.target.value)}
                  placeholder={
                    i === 0
                      ? "Paste a recent LinkedIn / IG / FB post you wrote yourself."
                      : "Paste another past post (optional, but better signal)."
                  }
                  rows={5}
                  className="font-mono text-xs leading-relaxed"
                />
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
            <div className="text-xs text-muted-foreground">
              {filledCount} / {VOICE_MAX_SLOTS} slots ready
              {updatedAt && (
                <span className="ml-2 text-[10px] text-muted-foreground">
                  Last saved {new Date(updatedAt).toLocaleString()}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {voiceSummary && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runDistill}
                  disabled={!canDistill || distilling}
                  className="gap-1.5"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${distilling ? "animate-spin" : ""}`}
                  />{" "}
                  Re-distill
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSave}
                disabled={distilling}
                className="gap-1.5 bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95 [@media(pointer:coarse)]:h-11"
              >
                {distilling ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Distilling...
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" /> Save voice profile
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {voiceSummary && (
        <Card className="border-border/60 shadow-card">
          <CardHeader>
            <CardTitle className="font-serif text-xl">
              Your voice summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
              {voiceSummary}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/generate")}
                className="gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" /> Generate a post
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------- Leo's sections (north-star brand-voice-memory) ----------

const SUMMARY_MAX = 1200;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "19 Oct". */
const dayMonth = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
const SCOPE_LABEL: Record<LearningScope, string> = { posts: "Posts", videos: "Videos", pictures: "Pictures", all: "Everything" };
const sourceLabel = (l: Learning) =>
  `${l.thread || l.source === "correction" ? "From a chat" : l.source === "assistant" ? "You told the assistant" : l.source === "rewrite" && l.rewrite && isLoggedRewrite(l.rewrite) ? `You kept ${REWRITE_LEARNINGS[l.rewrite].label} on 3 posts` : "Typed here"}, ${dayMonth(l.createdAt)}`;

const H2 = "font-serif text-xl font-semibold leading-tight scroll-mt-20";
const CHIP = "rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground";

/** A short input kept for this tab until it is added, so leaving the page doesn't lose it. */
function useDraft(key: string): [string, (v: string) => void] {
  const [v, setV] = useState(() => {
    try {
      return sessionStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    try {
      if (v) sessionStorage.setItem(key, v);
      else sessionStorage.removeItem(key);
    } catch {
      // storage blocked: the box just won't survive a page change
    }
  }, [key, v]);
  return [v, setV];
}

function HowYouSound(p: {
  userId: string;
  posts: string[];
  setPosts: (fn: (prev: string[]) => string[]) => void;
  filledCount: number;
  canDistill: boolean;
  distilling: boolean;
  updatedAt: string | null;
  summary: string;
  setSummary: (s: string) => void;
  editedAt: string | undefined;
  setEditedAt: (s: string | undefined) => void;
  setUpdatedAt: (s: string) => void;
  save: () => Promise<void>;
  keepMine: () => void;
  distill: () => Promise<void>;
}) {
  // captions from the brand's own audited accounts (a direct read; never starts a refresh): undefined while reading
  const [own, setOwn] = useState<string[] | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const handles = auditedHandles(loadSocialAccounts(p.userId));
    Promise.all(handles.map((h) => loadAuditFor(h.platform, h.handle).catch(() => null))).then((rows) => {
      if (!live) return;
      const found = rows.filter(Boolean);
      setOwn(found.length ? captionsForVoice(found.flatMap((r) => r!.posts ?? []), VOICE_MAX_SLOTS) : null);
    });
    return () => {
      live = false;
    };
  }, [p.userId]);
  const empty = SLOT_INDICES.filter((i) => !(p.posts[i] ?? "").trim());
  const useOwn = () => {
    const fill = (own ?? []).filter((c) => !p.posts.some((x) => x.trim() === c)).slice(0, empty.length);
    p.setPosts((prev) => {
      const next = [...prev];
      empty.forEach((slot, n) => fill[n] !== undefined && (next[slot] = fill[n]));
      return next;
    });
  };

  // the summary saves itself 600ms after the last key (or on leaving or reloading the page), dated as a hand edit
  const [status, setStatus] = useState<"" | "saving" | "saved" | "failed">("");
  const timer = useRef<number>();
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => {
    const flush = () => (window.clearTimeout(timer.current), pending.current?.());
    window.addEventListener("pagehide", flush);
    return () => (window.removeEventListener("pagehide", flush), flush());
  }, []);
  const editSummary = (text: string) => {
    p.setSummary(text);
    setStatus("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => pending.current?.(), 600);
    pending.current = () => {
      pending.current = null;
      const at = new Date().toISOString();
      try {
        const saved = loadVoiceProfile(p.userId);
        saveVoiceProfile(p.userId, { posts: saved?.posts ?? [], voiceSummary: text, updatedAt: at, summaryEditedAt: at });
        p.setEditedAt(at);
        p.setUpdatedAt(at);
        setStatus("saved");
      } catch {
        setStatus("failed");
      }
    };
  };

  // Re-distill, or Save with 3 posts ready, would replace a summary edited by hand: ask first
  const [asking, setAsking] = useState<"save" | "distill" | null>(null);
  const run = (what: "save" | "distill") => {
    if ((p.editedAt || status === "saving") && p.summary.trim() && p.canDistill) return setAsking(what);
    void (what === "save" ? p.save() : p.distill());
  };
  const price = <PriceChip price={WRITE_PRICE} left={null} />;

  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader className="space-y-1.5">
        <h2 id="how-you-sound" className={H2}>How you sound</h2>
        <CardDescription>
          At least {VOICE_MIN_FILLED} slots filled with {VOICE_MIN_CHARS}+ chars each. The rawer the better - paste verbatim from LinkedIn / IG / FB.
        </CardDescription>
        {own !== undefined && own !== null && (
          <div className="pt-1">
            <Button variant="outline" size="sm" onClick={useOwn} disabled={!own.length || !empty.length}>
              {own.length ? "Use my own posts" : "No posts long enough"}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {SLOT_INDICES.map((i) => {
          const text = p.posts[i] ?? "";
          const len = text.trim().length;
          const ready = len >= VOICE_MIN_CHARS;
          return (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor={`past-post-${i + 1}`}>Past post {i + 1}</Label>
                <span className={`text-[11px] ${ready ? "text-primary" : "text-muted-foreground"}`}>
                  {ready ? (
                    <span className="inline-flex items-center gap-1">
                      <Check className="h-3 w-3" /> {len} chars
                    </span>
                  ) : (
                    <>
                      {len} / {VOICE_MIN_CHARS} chars
                    </>
                  )}
                </span>
              </div>
              <Textarea
                id={`past-post-${i + 1}`}
                value={text}
                onChange={(e) => p.setPosts((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={i === 0 ? "Paste a recent LinkedIn / IG / FB post you wrote yourself." : "Paste another past post (optional, but better signal)."}
                rows={5}
                className="font-mono text-xs leading-relaxed"
              />
            </div>
          );
        })}

        <div className="space-y-1.5 border-t border-border/60 pt-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="voice-summary">Summary</Label>
            <span className={`text-[11px] ${status === "failed" ? "text-destructive" : "text-muted-foreground"}`} aria-live="polite">
              {status === "saving" ? "Saving..." : status === "saved" ? "Saved" : status === "failed" ? "Couldn't save that. Try again." : `${p.summary.length} / ${SUMMARY_MAX.toLocaleString("en-US")}`}
            </span>
          </div>
          <Textarea
            id="voice-summary"
            value={p.summary}
            maxLength={SUMMARY_MAX}
            onChange={(e) => editSummary(e.target.value)}
            placeholder="How you write, in a few lines. Save 3 posts to have it written for you."
            rows={4}
            className="text-sm leading-relaxed"
          />
          {asking && (
            <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
              <span className="mr-auto">Replace the summary you edited?</span>
              <Button size="sm" variant="outline" onClick={() => (window.clearTimeout(timer.current), (pending.current = null), setStatus(""), setAsking(null), void p.distill())}>Replace</Button>
              <Button size="sm" onClick={() => (asking === "save" && p.keepMine(), setAsking(null))}>Keep mine</Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <div className="text-xs text-muted-foreground">
            {p.filledCount} / {VOICE_MAX_SLOTS} slots ready
            {p.updatedAt && <span className="ml-2 text-[10px] text-muted-foreground">Last saved {new Date(p.updatedAt).toLocaleString()}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {p.summary && (
              <span className="inline-flex items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => run("distill")} disabled={!p.canDistill || p.distilling} className="gap-1.5">
                  <RefreshCw className={`h-3.5 w-3.5 ${p.distilling ? "animate-spin" : ""}`} /> Re-distill
                </Button>
                {p.canDistill && price}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Button
                size="sm"
                onClick={() => run("save")}
                disabled={p.distilling}
                className="gap-1.5 bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95 [@media(pointer:coarse)]:h-11"
              >
                {p.distilling ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Distilling...
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" /> Save voice profile
                  </>
                )}
              </Button>
              {p.canDistill && price}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FactsSection({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState(() => loadFacts(userId));
  useEffect(() => {
    setRows(loadFacts(userId));
    return onMemoryChanged(() => setRows(loadFacts(userId)));
  }, [userId]);
  const [text, setText] = useDraft(`cs-voice-fact-${scoped(userId)}`);
  const [line, setLine] = useState<string | null>(null);
  const on = rows.filter(isOn);
  const full = on.length >= MAX_FACTS;
  const add = (e: FormEvent) => {
    e.preventDefault();
    const r = addFact(userId, text);
    if ("error" in r) return setLine(r.error);
    setText("");
    setLine(null);
  };
  const remove = (id: string) => {
    const r = setFactOff(userId, id, true);
    if ("error" in r) return toast({ title: r.error, variant: "destructive" });
    toast({
      title: "Removed.",
      duration: 6000,
      action: (
        <ToastAction altText="Undo" onClick={() => { const u = setFactOff(userId, id, false); if ("error" in u) toast({ title: u.error, variant: "destructive" }); }}>
          Undo
        </ToastAction>
      ),
    });
  };
  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-1">
          <h2 id="facts" className={H2}>Facts the AI may use</h2>
          <InfoTip label="About facts">Posts may state these about you, and no other claims.</InfoTip>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {on.length > 0 && (
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {on.map((f) => (
              <li key={f.id} className="flex items-center gap-2 py-1 pl-3 pr-1 text-sm">
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{f.text}</span>
                <Button variant="ghost" size="icon" aria-label={`Remove ${f.text}`} title="Remove" onClick={() => remove(f.id)} className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={add} className="space-y-1.5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label="A fact the AI may use"
              value={text}
              maxLength={FACT_CHARS}
              onChange={(e) => (setText(e.target.value), setLine(null))}
              placeholder={adviserBrand() ? "12 years as an adviser" : "12 years in my field"}
              disabled={full}
              className="min-w-0 flex-1"
            />
            <Button type="submit" variant="outline" disabled={full || !text.trim()} className="shrink-0">Add a fact</Button>
          </div>
          <p className={`text-xs ${line ? "text-destructive" : "text-muted-foreground"}`} role={line ? "alert" : undefined}>
            {line ?? (full ? fullLine(MAX_FACTS) : "Only add facts you can prove.")}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

type Row = { key: string; text: string; scope: LearningScope; from: string; remove: () => void; learning?: string; to?: string };

/** Exported for its test. */
export function LearnedSection({ userId }: { userId: string }) {
  const { toast } = useToast();
  const read = () => ({ learned: activeLearnings(loadLearnings(userId)), coach: loadCoachProfile(userId) });
  const [data, setData] = useState(read);
  useEffect(() => {
    setData(read());
    return onMemoryChanged(() => setData(read()));
  }, [userId]);
  const refresh = () => setData(read());

  // ?learning=<id> scrolls to that row and rings it for 2 seconds
  const [linked] = useUrlItem("learning");
  const linkedRef = useScrollToItem<HTMLLIElement>(!!linked && data.learned.some((l) => l.id === linked));
  useGoneItem("learning", linked ? data.learned.some((l) => l.id === linked) : undefined, "learning");
  const [ring, setRing] = useState(false);
  useEffect(() => {
    if (!linked) return;
    setRing(true);
    const t = window.setTimeout(() => setRing(false), 2000);
    return () => window.clearTimeout(t);
  }, [linked]);

  const undoToast = (undo: () => void) =>
    toast({
      title: "Removed.",
      duration: 6000,
      action: (
        <ToastAction altText="Undo" onClick={undo}>
          Undo
        </ToastAction>
      ),
    });
  const removeLearning = (id: string) => {
    const r = setLearningOff(userId, id, true);
    if ("error" in r) return toast({ title: r.error, variant: "destructive" });
    undoToast(() => {
      const u = setLearningOff(userId, id, false);
      if ("error" in u) toast({ title: u.error, variant: "destructive" });
    });
  };
  const removeCoach = (kind: "like" | "dislike", note: string) => {
    const before = loadCoachProfile(userId);
    removePreference(userId, kind, note);
    refresh();
    undoToast(() => (saveCoachProfile(userId, before), refresh()));
  };

  const rows: Row[] = [
    // links.agent encodes the stored ids, so a row's link never leaves /agent
    ...data.learned.map((l) => ({ key: l.id, learning: l.id, text: l.text, scope: l.scope, from: sourceLabel(l), to: l.thread ? links.agent({ thread: l.thread, m: l.msg }) : undefined, remove: () => removeLearning(l.id) })),
    ...data.coach.likes.map((x) => ({ key: `like:${x}`, text: `Lean into: ${x}`, scope: "posts" as const, from: "From Coach", remove: () => removeCoach("like", x) })),
    ...data.coach.dislikes.map((x) => ({ key: `dislike:${x}`, text: `Steer clear of: ${x}`, scope: "posts" as const, from: "From Coach", remove: () => removeCoach("dislike", x) })),
  ];

  const [text, setText] = useDraft(`cs-voice-learn-${scoped(userId)}`);
  const [scope, setScope] = useState<LearningScope>("all");
  const [line, setLine] = useState<string | null>(null);
  const full = data.learned.length >= MAX_LEARNINGS;
  const add = (e: FormEvent) => {
    e.preventDefault();
    const r = addLearning(userId, { text, scope, source: "typed" });
    if ("error" in r) return setLine(r.error);
    setText("");
    setLine(null);
  };

  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader className="pb-3">
        <h2 id="learned" className={H2}>What the AI has learned</h2>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length > 0 && (
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {rows.map((r) => (
              <li
                key={r.key}
                ref={r.learning && r.learning === linked ? linkedRef : undefined}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 pl-3 pr-1 text-sm transition-shadow ${r.learning && r.learning === linked && ring ? "rounded-lg ring-2 ring-primary" : ""}`}
              >
                <span className="min-w-0 flex-1 basis-48 font-medium [overflow-wrap:anywhere]">{r.text}</span>
                <span className={CHIP}>{SCOPE_LABEL[r.scope]}</span>
                {r.to ? (
                  <Link to={r.to} className="inline-flex items-center text-xs text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-primary [@media(pointer:coarse)]:min-h-11">
                    {r.from}
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">{r.from}</span>
                )}
                <Button variant="ghost" size="sm" onClick={r.remove} className="px-2 text-muted-foreground hover:text-destructive">Remove</Button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={add} className="space-y-1.5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label="Something for the AI to keep doing or stop"
              value={text}
              maxLength={LEARNING_CHARS}
              onChange={(e) => (setText(e.target.value), setLine(null))}
              placeholder="Never open a post with a question"
              disabled={full}
              className="min-w-0 flex-1"
            />
            <div className="flex gap-2">
              <select
                aria-label="Use it for"
                value={scope}
                onChange={(e) => setScope(e.target.value as LearningScope)}
                disabled={full}
                className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm [@media(pointer:coarse)]:min-h-11 sm:flex-none"
              >
                {LEARNING_SCOPES.map((s) => (
                  <option key={s} value={s}>{SCOPE_LABEL[s]}</option>
                ))}
              </select>
              <Button type="submit" variant="outline" disabled={full || !text.trim()} className="shrink-0">Add</Button>
            </div>
          </div>
          {(line || full) && (
            <p className={`text-xs ${line ? "text-destructive" : "text-muted-foreground"}`} role={line ? "alert" : undefined}>
              {line ?? fullLine(MAX_LEARNINGS)}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
