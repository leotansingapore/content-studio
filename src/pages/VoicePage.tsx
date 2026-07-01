import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  Mic,
  Save,
  RefreshCw,
  Loader2,
  Sparkles,
  Check,
  ArrowLeft,
} from "lucide-react";
import {
  loadVoiceProfile,
  saveVoiceProfile,
  VOICE_MAX_SLOTS,
  VOICE_MIN_CHARS,
  VOICE_MIN_FILLED,
  type VoiceProfile,
} from "@/lib/voiceProfile";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "https://hgdbflprrficdoyxmdxe.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnZGJmbHBycmZpY2RveXhtZHhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE3NjY0NDAsImV4cCI6MjA2NzM0MjQ0MH0.2qwUbh0nkFyOLzzZgXk7bedINzHSf2ULMBUECOqWmIw";

const SLOT_INDICES = Array.from({ length: VOICE_MAX_SLOTS }, (_, i) => i);

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
      }
    })();
    return () => {
      active = false;
    };
  }, []);

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
      // Still save the raw posts, but skip distill.
      persistOnly("");
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
        body: JSON.stringify({ mode: "voice-summary", posts: filled }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`voice-summary failed (${res.status}) ${text}`);
      }
      const data = (await res.json()) as { voiceSummary?: string; error?: string };
      if (data.error) throw new Error(data.error);
      const summary = (data.voiceSummary ?? "").trim();
      setVoiceSummary(summary);
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

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          Your voice
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Do this once. Paste a few posts you wrote yourself and every future
          draft will sound like you, not generic AI.
        </p>
      </header>

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            Paste {VOICE_MIN_FILLED}-{VOICE_MAX_SLOTS} of your past social posts.
            We'll distill your tone, hook patterns and structure into a voice
            profile that steers every future generation toward sounding like
            YOU, not generic AI.
          </span>
        </div>
        <Link
          to="/generate"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-3 w-3" /> Skip for now
        </Link>
      </div>

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
                <span className="ml-2 text-[10px] text-muted-foreground/80">
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
                className="gap-1.5 bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95"
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
            <CardDescription>
              This is what we'll inject into every generation as your voice
              fingerprint. Re-distill anytime you change the past posts.
            </CardDescription>
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
