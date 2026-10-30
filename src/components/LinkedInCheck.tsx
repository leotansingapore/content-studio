// The LinkedIn post check under a LinkedIn draft in Write (src/lib/linkedinCheck.ts): a Ship or Revise verdict, the
// one fix to make first and the other checks it missed, with the twelfth check (a picture) as a standing reminder.
// A draft already checked on this device shows its result at once; it never checks on load.

import { useEffect, useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import {
  LINKEDIN_CHECKS,
  LINKEDIN_CHECK_IDS,
  LINKEDIN_MEDIA_TIP,
  checkLinkedIn,
  linkedInKey,
  loadLinkedInChecks,
  saveLinkedInCheck,
} from "@/lib/linkedinCheck";

export default function LinkedInCheck({ userId, draft }: { userId: string | null | undefined; draft: string }) {
  const [checks, setChecks] = useState(() => loadLinkedInChecks(userId));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  useEffect(() => setChecks(loadLinkedInChecks(userId)), [userId]);
  const key = useMemo(() => linkedInKey(draft), [draft]);
  const result = checks[key];
  const short = draft.trim().length < 40;

  const run = async () => {
    if (!userId || busy) return;
    const at = key;
    setBusy(at);
    setError(null);
    try {
      const r = await checkLinkedIn(draft);
      setChecks(saveLinkedInCheck(userId, at, r));
    } catch (e) {
      setError({ key: at, message: e instanceof Error ? e.message : "Couldn't check it right now. Try again in a minute." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 p-3" aria-live="polite" data-linkedin-check>
      {result ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">LinkedIn check</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${result.verdict === "ship" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
              {result.verdict === "ship" ? "Ready to post" : "Revise first"}
            </span>
            <span className="text-xs text-muted-foreground">
              {result.passed} of {LINKEDIN_CHECK_IDS.length} checks
            </span>
            <InfoTip label="About the LinkedIn check">What LinkedIn posts that travel tend to have. A guide, not a promise.</InfoTip>
          </div>
          {result.fix && (
            <p className="mt-2 text-xs">
              <span className="font-semibold">Fix first, {LINKEDIN_CHECKS[result.fix].label.toLowerCase()}:</span>{" "}
              <span className="text-muted-foreground">{LINKEDIN_CHECKS[result.fix].tip}</span>
            </p>
          )}
          {result.missed.length > 1 && (
            <ul className="mt-2 space-y-1.5" aria-label="Also missed">
              {result.missed.slice(1).map((id) => (
                <li key={id} className="text-xs">
                  <span className="font-semibold">{LINKEDIN_CHECKS[id].label}:</span> <span className="text-muted-foreground">{LINKEDIN_CHECKS[id].tip}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Picture:</span> {LINKEDIN_MEDIA_TIP}
          </p>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className={`h-9 gap-1.5 ${busy === key ? "disabled:opacity-100" : ""}`} onClick={() => void run()} disabled={!!busy || !userId || short}>
            {busy === key ? <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> : <ListChecks className="h-3.5 w-3.5" />}
            {busy === key ? "Checking..." : "Check it for LinkedIn"}
          </Button>
          {short && <p className="basis-full text-xs text-muted-foreground">Write a bit more before checking it.</p>}
          {error?.key === key && (
            <p className="basis-full text-xs text-destructive" role="alert">
              {error.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
