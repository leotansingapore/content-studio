// Analytics > Your real numbers: pulls the year's post numbers for the open brand's connected accounts
// (src/lib/realNumbers.ts). Posts sent with Post it for me get them in place of typed numbers; the rest
// are listed as posted outside the app. Shown only while Social accounts is switched on.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { loadDrafts, setDraftNumbers } from "@/lib/draftHistory";
import { activeProfileId } from "@/lib/profiles";
import { isNotEnabled, platformName } from "@/lib/socialConnect";
import { matchPulled, numbersLine, pullNumbers, realNumbersOn, rememberRealNumbers, type MetricsPost } from "@/lib/realNumbers";

type State =
  | { at: "idle" }
  | { at: "pulling" }
  | { at: "none" }
  | { at: "done"; matched: number; outside: MetricsPost[]; when: Date }
  | { at: "error"; message: string }
  | { at: "off" };

const TOUCH = "[@media(pointer:coarse)]:h-11";

const postLine = (p: MetricsPost) => numbersLine(p.numbers, ["views", "reach", "likes", "comments", "shares", "saves"]) || "No numbers yet";

const dayLabel = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Singapore" }) : "");

export default function RealNumbers({ userId, onChange }: { userId: string; onChange: () => void }) {
  const [state, setState] = useState<State>({ at: "idle" });

  const pull = useCallback(async () => {
    setState({ at: "pulling" });
    try {
      const { accounts, posts } = await pullNumbers(activeProfileId(userId));
      if (!accounts.length) return setState({ at: "none" });
      const { byDraft, outside } = matchPulled(loadDrafts(userId), posts);
      setDraftNumbers(userId, byDraft, new Date().toISOString());
      rememberRealNumbers(userId);
      setState({ at: "done", matched: byDraft.size, outside, when: new Date() });
      onChange();
    } catch (e) {
      setState(isNotEnabled(e) ? { at: "off" } : { at: "error", message: e instanceof Error ? e.message : "Couldn't read your numbers. Try again in a minute." });
    }
  }, [userId, onChange]);

  // once used for this brand, every visit pulls again so the numbers stay fresh
  useEffect(() => {
    setState({ at: "idle" });
    if (realNumbersOn(userId)) void pull();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (state.at === "off") return null;
  const busy = state.at === "pulling";

  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-1 font-serif text-lg">
          Your real numbers
          <InfoTip label="About real numbers">Posts sent with Post it for me show these instead of typed numbers.</InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div aria-live="polite" className="space-y-3">
          {(state.at === "idle" || busy) && (
            <p className="text-sm text-muted-foreground">Views, reach, likes, comments, shares and saves for the last 12 months, from your connected accounts.</p>
          )}
          {state.at === "none" && <p className="text-sm text-muted-foreground">No accounts are connected for this brand yet.</p>}
          {state.at === "error" && <p className="text-sm text-destructive">{state.message}</p>}
          {state.at === "done" && (
            <p className="text-sm text-muted-foreground">
              {state.matched
                ? `${state.matched === 1 ? "1 post" : `${state.matched} posts`} from Post it for me now ${state.matched === 1 ? "shows" : "show"} real numbers. `
                : "None of your Post it for me posts have numbers yet. "}
              Updated {state.when.toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit" })}.
            </p>
          )}
        </div>

        {state.at === "none" ? (
          <Button asChild variant="outline" size="sm" className={TOUCH}>
            <Link to="/accounts">Connect an account</Link>
          </Button>
        ) : (
          <Button type="button" size="sm" variant={state.at === "done" ? "outline" : "default"} onClick={pull} disabled={busy} className={`gap-1.5 ${TOUCH}`}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {busy ? "Pulling your numbers..." : state.at === "done" ? "Update" : state.at === "error" ? "Try again" : "Use my real numbers"}
          </Button>
        )}

        {state.at === "done" && state.outside.length > 0 && (
          <details className="group" open={state.outside.length <= 5}>
            <summary className={`inline-flex h-9 cursor-pointer list-none items-center text-sm font-medium text-foreground ${TOUCH} [&::-webkit-details-marker]:hidden`}>
              Posted outside the app ({state.outside.length})
            </summary>
            <ul className="space-y-2">
              {state.outside.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{p.text.split("\n").find((l) => l.trim()) || "A post"}</p>
                    <p className="text-[11px] text-muted-foreground">{[platformName(p.platform), dayLabel(p.publishedAt)].filter(Boolean).join(", ")}</p>
                    <p className="text-xs text-foreground">{postLine(p)}</p>
                  </div>
                  {p.url && (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open the post on ${platformName(p.platform)}`}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-primary [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
