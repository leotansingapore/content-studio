// TikTok's posting mode under its row in the schedule steps (publish-tiktok, Leo only): Send to inbox or Post directly,
// the inbox notice, the new-account line, and the warm-up guard that opens when Post directly is pressed on an account
// nobody said is warmed up. The mode and warmedAt live in tiktokCare.ts; this only draws them.

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TikTokMode as Mode } from "@/lib/tiktokCare";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const pill = (on: boolean) =>
  `min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors ${TOUCH} ${
    on ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
  }`;

/** The guard opens whole in view, its buttons above the agent button (88 px up and 44 px tall on phones: scroll-mb-36). */
const inView = (el: HTMLElement | null) => el?.scrollIntoView({ block: "nearest" });

export const INBOX_HELP = "It lands in your TikTok inbox. You finish it in the app.";
export const DIRECT_HELP = "It goes straight to your TikTok profile.";
export const INBOX_NOTICE =
  "After it's sent, open TikTok > Inbox > System notifications and tap the post to finish it. TikTok may not keep the caption, so copy it before you go.";

export function TikTokMode({
  handle,
  mode,
  isNew,
  warmed,
  onMode,
  onWarmed,
}: {
  /** The account's @handle, without the @. */
  handle: string;
  mode: Mode;
  /** Fewer than 5 posts on the account (isNewTikTok). */
  isNew: boolean;
  /** The account has a warmedAt: Post directly needs no guard. */
  warmed: boolean;
  onMode: (m: Mode) => void;
  /** "My account is warmed up" with "Don't ask again" ticked: saves warmedAt (markWarmed). */
  onWarmed: () => void;
}) {
  const [guard, setGuard] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);
  const keep = () => {
    setGuard(false);
    setDontAsk(false);
  };
  const warmedUp = () => {
    if (dontAsk) onWarmed();
    onMode("direct");
    keep();
  };

  return (
    <div className="space-y-1.5">
      {isNew && <p className="text-muted-foreground">New account: send your first posts to the inbox.</p>}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Posting mode">
        <span className="font-semibold text-foreground">Posting mode</span>
        <button type="button" aria-pressed={mode === "inbox"} onClick={() => onMode("inbox")} className={pill(mode === "inbox")}>Send to inbox</button>
        <button type="button" aria-pressed={mode === "direct"} onClick={() => mode !== "direct" && (warmed ? onMode("direct") : setGuard(true))} className={pill(mode === "direct")}>Post directly</button>
      </div>
      <p className="text-muted-foreground">{mode === "inbox" ? INBOX_HELP : DIRECT_HELP}</p>
      {mode === "inbox" && <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-2 text-amber-900 dark:text-amber-200">{INBOX_NOTICE}</p>}
      {guard && (
        <div ref={inView} role="alertdialog" aria-labelledby="tiktok-guard-title" className="scroll-mb-36 space-y-2 rounded-lg border border-border bg-background p-3">
          <div className="flex items-start justify-between gap-2">
            <p id="tiktok-guard-title" className="font-semibold text-foreground">Warm up this account first</p>
            <button type="button" onClick={keep} aria-label="Keep send to inbox" className="-m-2 grid h-11 w-11 place-items-center text-muted-foreground hover:text-foreground sm:h-8 sm:w-8 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-muted-foreground">Posting straight to a new account can leave its first videos with almost no views.</p>
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-2 text-amber-900 dark:text-amber-200">
            <p className="font-semibold">To warm it up:</p>
            <ul className="ml-4 list-disc">
              <li>Follow a few accounts in your niche and like some posts</li>
              <li>Post a few times with Send to inbox</li>
              <li>Wait until those posts get some views</li>
            </ul>
          </div>
          <label className={`flex min-h-9 items-center gap-2 ${TOUCH}`}>
            <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} className="h-4 w-4 accent-primary" />
            Don't ask again for @{handle}
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" onClick={warmedUp} className={`h-9 ${TOUCH}`}>My account is warmed up</Button>
            <Button size="sm" onClick={keep} className={`h-9 ${TOUCH}`}>Keep send to inbox</Button>
          </div>
        </div>
      )}
    </div>
  );
}
