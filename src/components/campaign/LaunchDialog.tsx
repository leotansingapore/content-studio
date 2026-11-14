// "Launch <name>?" on a campaign page (?launch=1, Leo's sign-ins), after Fastlane's: the picked accounts with the
// times their posts go out (or "You post these yourself" with the platforms), a strip of the first 14 posts (made
// ones drawn, the rest empty boxes), the line of what Launch does with the real counts (launchPlan, launchLine), and
// Not yet / Launch. Launch runs src/lib/campaignLaunch.ts; this only shows it and hands the outcome back.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CircleNotchIcon, XIcon } from "@phosphor-icons/react";
import { DraftTile, draftWords, slideUrls } from "@/components/campaign/AllPosts";
import { postTimesLine } from "@/components/campaign/ConfigurePanel";
import { Button } from "@/components/ui/button";
import { browserTimeZone, zoneName } from "@/lib/autoPost";
import { launchCampaign, launchLine, launchPlan, takesAlone, type LaunchOutcome } from "@/lib/campaignLaunch";
import type { Campaign } from "@/lib/campaigns";
import { loadBrand } from "@/lib/carousel";
import { loadDrafts } from "@/lib/draftHistory";
import { activeProfileId } from "@/lib/profiles";
import { platformName, socialStatus, type AccountView } from "@/lib/socialConnect";
import { cn } from "@/lib/utils";

const HEAD = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const STRIP = 14;

export default function LaunchDialog({ userId, campaign: c, onClose, onDone, onBusy }: {
  userId: string;
  campaign: Campaign;
  onClose: () => void;
  onDone: (out: LaunchOutcome) => void;
  /** True while Launch runs, so the page keeps this open (and Pause out of reach) until the sends are done. */
  onBusy: (busy: boolean) => void;
}) {
  const picked = c.accountIds ?? [];
  const [accounts, setAccounts] = useState<AccountView[] | "loading" | "failed">(picked.length ? "loading" : []);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!picked.length) return;
    let live = true;
    setAccounts("loading");
    socialStatus(activeProfileId(userId)).then((s) => live && setAccounts(s.accounts), () => live && setAccounts("failed"));
    return () => {
      live = false;
    };
  }, [userId, picked.length, attempt]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [busy, onClose]);

  const tz = browserTimeZone();
  const read = Array.isArray(accounts) ? accounts : null;
  const plan = read ? launchPlan(c, loadDrafts(userId), read, loadBrand(userId), Date.now()) : null;
  const strip = [...c.posts].filter((p) => p.state !== "skipped").sort((a, b) => a.n - b.n).slice(0, STRIP);
  const drawnKey = strip.filter((p) => p.state === "made" && p.format === "carousel").map((p) => `${p.n}:${p.hook}:${p.body}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const slides = useMemo(() => new Map(strip.filter((p) => p.state === "made" && p.format === "carousel").map((p) => [p.n, slideUrls(userId, p)[0]])), [userId, drawnKey]);
  const times = postTimesLine(c, zoneName(tz));

  const launch = async () => {
    if (busy || !plan) return;
    setBusy(true);
    onBusy(true);
    const out = await launchCampaign(userId, c.id);
    setBusy(false);
    onBusy(false);
    onDone(out);
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="launch-title" className="flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-background shadow-elegant sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-start justify-between gap-2 border-b border-border/60 px-4 py-3">
          <h2 id="launch-title" className="min-w-0 font-serif text-lg font-semibold [overflow-wrap:anywhere]">Launch {c.name}?</h2>
          <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 sm:h-10 sm:w-10" aria-label="Close" disabled={busy} onClick={onClose}>
            <XIcon className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <section aria-labelledby="launch-accounts" className="space-y-2">
            <h3 id="launch-accounts" className={HEAD}>Your accounts</h3>
            {!picked.length ? (
              <p className="text-sm">You post these yourself on {c.platforms.map(platformName).join(", ")}.</p>
            ) : accounts === "loading" ? (
              <div className="h-11 animate-pulse rounded-lg bg-muted/50" aria-busy="true" />
            ) : accounts === "failed" ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm">Couldn&apos;t read your accounts.</p>
                <Button variant="outline" className="h-11 sm:h-9" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
              </div>
            ) : (
              <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                {picked.map((id) => {
                  const a = read?.find((x) => x.id === id);
                  const alone = a && !a.needsReconnect && takesAlone(a.platform, true);
                  return (
                    <li key={id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2.5 text-sm">
                      <span className="min-w-0 break-words font-medium">{a ? `@${a.username.replace(/^@/, "") || a.name}` : "An account no longer connected"}</span>
                      <span className={cn("text-xs", alone ? "text-muted-foreground" : "text-warning")}>
                        {!a ? "Nothing goes to it" : a.needsReconnect ? "Reconnect it first" : alone ? `${platformName(a.platform)} | ${times}` : `${platformName(a.platform)} | Waits for you`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <ol aria-label="The campaign's first posts" className="grid grid-cols-7 gap-1.5">
            {strip.map((p) => (
              <li key={p.n} className={cn("relative aspect-[4/5] overflow-hidden rounded-md border", p.state === "made" ? "border-border/60 bg-muted" : "border-dashed border-border")}>
                {p.state === "made" && (
                  <span className="absolute left-0 top-0 block h-[400%] w-[400%] origin-top-left scale-[0.25]">
                    <DraftTile words={draftWords(p)} slide={slides.get(p.n)} />
                  </span>
                )}
                <span className="sr-only">Post {p.n}, {p.state === "made" ? "made" : "not made yet"}</span>
              </li>
            ))}
          </ol>

          <div className="space-y-2 text-sm">
            {plan ? <p>{launchLine(plan, picked.length)}</p> : <p className="text-muted-foreground">Checking what goes out...</p>}
            <p className="text-muted-foreground">Launching costs nothing more. You can pause or stop any time.</p>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
          <Button variant="ghost" className="h-11 sm:h-10" disabled={busy} onClick={onClose}>Not yet</Button>
          <Button className="h-11 gap-1.5 sm:h-10" disabled={busy || !plan} onClick={() => void launch()}>
            {busy && <CircleNotchIcon className="h-4 w-4 animate-spin" aria-hidden />}
            {busy ? "Launching..." : "Launch"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
