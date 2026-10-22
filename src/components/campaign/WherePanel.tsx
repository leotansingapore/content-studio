// WHERE IT POSTS on /campaigns/:id (plan-campaign-page, Leo only). A campaign with picked accounts checks them once
// per visit with socialStatus (one social-read, free) and shows each with its healthLabel; a picked account that is
// gone from the brand counts as needing reconnecting. With platform chips only, the person posts them.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Campaign } from "@/lib/campaigns";
import { activeProfileId } from "@/lib/profiles";
import { healthLabel, platformName, socialStatus, type AccountView } from "@/lib/socialConnect";

const HEAD = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const LINK = "inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline sm:min-h-0";

export default function WherePanel({ userId, campaign: c }: { userId: string; campaign: Campaign }) {
  const picked = (c.accountIds ?? []).join(",");
  const [read, setRead] = useState<AccountView[] | "loading" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!picked) return;
    let live = true;
    setRead("loading");
    socialStatus(activeProfileId(userId)).then((s) => live && setRead(s.accounts), () => live && setRead("failed"));
    return () => {
      live = false;
    };
  }, [userId, picked, attempt]);

  let body;
  if (!picked) {
    body = (
      <>
        <p className="text-sm">You post these yourself.</p>
        <Link to="/accounts" className={LINK}>Connect an account</Link>
      </>
    );
  } else if (read === "loading") {
    body = <div className="h-12 animate-pulse rounded-lg bg-muted/50" aria-busy="true" />;
  } else if (read === "failed") {
    body = (
      <>
        <p className="text-sm">Couldn&apos;t check your accounts.</p>
        <Button variant="outline" className="h-11 sm:h-10" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
      </>
    );
  } else {
    const ids = picked.split(",");
    const found = read.filter((a) => ids.includes(a.id));
    const bad = ids.filter((id) => !found.some((a) => a.id === id && !a.needsReconnect)).length;
    body = (
      <>
        {bad ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">{bad === 1 ? "1 account needs reconnecting" : `${bad} accounts need reconnecting`}</p>
            <Link to="/accounts" className={LINK}>Fix on Social accounts</Link>
          </div>
        ) : (
          <p className="flex items-start gap-2">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-medium">Accounts ready</span>
              <span className="block text-sm text-muted-foreground">{c.platforms.map(platformName).join(", ")}</span>
            </span>
          </p>
        )}
        <ul className="space-y-1.5">
          {found.map((a) => (
            <li key={a.id} className="min-w-0 text-sm">
              <span className="block break-words">@{a.username.replace(/^@/, "")}</span>
              <span className={`block text-xs ${a.needsReconnect ? "text-destructive" : "text-muted-foreground"}`}>
                {platformName(a.platform)} | {healthLabel(a)}
              </span>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <section aria-labelledby="where-h" className="space-y-3 rounded-xl border border-border/60 bg-card p-5 shadow-card">
      <h2 id="where-h" className={HEAD}>Where it posts</h2>
      {body}
    </section>
  );
}
