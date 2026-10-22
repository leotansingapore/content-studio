// The campaign wizard's step 3 (plan-campaign, Leo only): where the posts go out. With connected accounts (Social
// accounts on, socialStatus read once per brand per page load, one social-read) it lists them, up to 5, every working
// one picked at first; otherwise the four platforms as chips, the brand's own platform picked. The wizard page draws
// the step's header, Back and Confirm.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PlanPlatform } from "@/lib/positioning";
import { activeProfileId } from "@/lib/profiles";
import { platformName, socialConnectShown, socialStatus, type AccountView } from "@/lib/socialConnect";
import { MAX_ACCOUNTS } from "@/lib/campaignWizard";
import { ROW, rowOn } from "@/components/campaign/WhoStep";

export const PLATFORMS: PlanPlatform[] = ["linkedin", "instagram", "facebook", "tiktok"];

export type Accounts = { state: "off" } | { state: "loading" } | { state: "ready"; accounts: AccountView[] };

const reads = new Map<string, Promise<AccountView[]>>();

/** The brand's connected accounts on the four campaign platforms; "off" when Social accounts is off or unread. */
export function useAccounts(userId: string): Accounts {
  const [s, setS] = useState<Accounts>(() => (socialConnectShown() ? { state: "loading" } : { state: "off" }));
  useEffect(() => {
    if (!socialConnectShown()) return;
    const id = activeProfileId(userId);
    let read = reads.get(id);
    if (!read) {
      read = socialStatus(id).then((r) => r.accounts.filter((a) => (PLATFORMS as string[]).includes(a.platform)));
      reads.set(id, read);
      read.catch(() => reads.delete(id));
    }
    let live = true;
    read.then((accounts) => live && setS({ state: "ready", accounts }), () => live && setS({ state: "off" }));
    return () => {
      live = false;
    };
  }, [userId]);
  return s;
}

/** Every working account, up to 5: the picks before the person changes them. */
export const defaultAccounts = (accounts: AccountView[]) => accounts.filter((a) => !a.needsReconnect).slice(0, MAX_ACCOUNTS).map((a) => a.id);

const CHIP = "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors";

export default function WhereStep({ accounts, picked, onAccounts, platforms, onPlatforms }: {
  accounts: Accounts;
  picked: string[];
  onAccounts: (ids: string[]) => void;
  platforms: PlanPlatform[];
  onPlatforms: (p: PlanPlatform[]) => void;
}) {
  if (accounts.state === "loading") {
    return (
      <div className="space-y-1.5" aria-busy="true">
        {[0, 1].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg border border-dashed border-border bg-muted/40" />)}
      </div>
    );
  }
  if (accounts.state === "ready" && accounts.accounts.length) {
    const full = picked.length >= MAX_ACCOUNTS;
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Up to {MAX_ACCOUNTS}</p>
        <div className="grid gap-1.5">
          {accounts.accounts.map((a) => {
            const on = picked.includes(a.id);
            return (
              <label key={a.id} className={`${ROW} cursor-pointer ${rowOn(on)} ${!on && full ? "opacity-50" : ""}`}>
                <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-primary" checked={on} disabled={!on && full}
                  onChange={() => onAccounts(on ? picked.filter((id) => id !== a.id) : [...picked, a.id])} />
                <span className="min-w-0">
                  <span className="block break-words font-medium">@{a.username.replace(/^@/, "")}</span>
                  <span className="mt-0.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {platformName(a.platform)} | {a.needsReconnect ? "Reconnect needed" : "Connected"}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PLATFORMS.map((p) => {
          const on = platforms.includes(p);
          return (
            <button key={p} type="button" aria-pressed={on} onClick={() => onPlatforms(on ? platforms.filter((x) => x !== p) : [...platforms, p])}
              className={`${CHIP} ${on ? "border-primary/60 bg-primary/10 text-foreground" : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>
              {platformName(p)}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">
        You post these yourself, or{" "}
        <Link to="/accounts" className="text-primary underline-offset-4 hover:underline">connect an account</Link>.
      </p>
    </div>
  );
}
