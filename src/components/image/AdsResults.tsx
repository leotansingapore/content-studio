// Ads on /image (docs/adlauncher-ads.md, phase 3): the ads this brand launched through AdLauncher, newest first, each
// with its status on Meta and its spend, leads and cost per lead since it was made (get-campaign-status and
// get-campaign-metrics). Read when the block is opened, and at most every 30 minutes per campaign (cs-ad-results,
// this device). Read only: nothing here switches an ad on or off.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import {
  adlCall,
  campaignLink,
  loadLaunches,
  loadResults,
  metricsWindow,
  needsReconnect,
  resultDue,
  saveResult,
  sgDate,
  statusWord,
  LAUNCHES_CHANGED,
  type AdLaunch,
  type CampaignMetrics,
  type CampaignStatus,
} from "@/lib/adlauncher";
import { links } from "@/lib/links";
import { cn } from "@/lib/utils";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
// a bound on calls per opening; older ads keep the numbers last read
const READ_AT_MOST = 20;

const money = (currency: string | null, n: number) => `${currency ? `${currency} ` : ""}${n.toFixed(2)}`;

export default function AdsResults({ userId }: { userId: string }) {
  const [launches, setLaunches] = useState<AdLaunch[]>(() => loadLaunches(userId));
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState(loadResults);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");

  // an ad made in the sheet shows at once
  useEffect(() => {
    const again = () => setLaunches(loadLaunches(userId));
    window.addEventListener(LAUNCHES_CHANGED, again);
    return () => window.removeEventListener(LAUNCHES_CHANGED, again);
  }, [userId]);

  // one campaign after another: a token refresh rotates the token, so calls don't overlap
  const read = async (list: AdLaunch[]) => {
    const due = list.slice(0, READ_AT_MOST).filter((l) => resultDue(loadResults()[l.campaignId], Date.now()));
    if (!due.length) return;
    setReading(true);
    setError("");
    try {
      for (const l of due) {
        const st = await adlCall<CampaignStatus>("get-campaign-status", { campaignId: l.campaignId });
        const mt = await adlCall<CampaignMetrics>("get-campaign-metrics", { campaignId: l.campaignId, ...metricsWindow(l.at, Date.now()), limit: 1 });
        const t = mt.ok ? mt.data?.totals : undefined;
        saveResult(l.campaignId, {
          at: Date.now(),
          status: st.ok ? statusWord(st.data) : "Not found in AdLauncher",
          spend: typeof t?.spend === "number" ? t.spend : null,
          leads: typeof t?.leads === "number" ? t.leads : null,
          cpl: typeof t?.cpl === "number" ? t.cpl : null,
        });
        setResults(loadResults());
      }
    } catch (e) {
      setError(needsReconnect(e) ? "Reconnect AdLauncher to see the latest numbers." : e instanceof Error ? e.message : "The numbers didn't load. Try again.");
    } finally {
      setReading(false);
    }
  };

  if (!launches.length) return null;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void read(launches);
  };

  return (
    <section className="space-y-2 border-t border-border/60 pt-4" aria-labelledby="ads-heading">
      <button type="button" onClick={toggle} aria-expanded={open} aria-controls="ads-list" className={cn("flex w-full items-center justify-between gap-2 text-left", TOUCH)}>
        <h2 id="ads-heading" className="text-sm font-semibold">
          Ads <span className="font-normal text-muted-foreground">{launches.length}</span>
        </h2>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {reading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Reading the numbers" />}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
        </span>
      </button>
      {open && (
        <div id="ads-list" className="space-y-2">
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}{" "}
              {error.startsWith("Reconnect") && (
                <Link to={links.adlauncher()} className="font-semibold text-primary hover:underline">
                  Open AdLauncher settings
                </Link>
              )}
            </p>
          )}
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {launches.map((l) => {
              const r = results[l.campaignId];
              return (
                <li key={l.campaignId} className="space-y-1 px-3 py-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 font-medium [overflow-wrap:anywhere]">{l.name}</p>
                    <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground">{r?.status ?? (reading ? "Reading..." : "Paused when made")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r && r.spend !== null
                      ? `${money(l.currency, r.spend)} spent, ${r.leads ?? 0} ${r.leads === 1 ? "lead" : "leads"}${r.cpl !== null ? `, ${money(l.currency, r.cpl)} a lead` : ""}`
                      : `Made ${sgDate(new Date(l.at))}, ${l.goal === "leads" ? "for leads" : "for website visits"}`}
                  </p>
                  <p className="flex flex-wrap gap-x-3 text-xs">
                    <a href={campaignLink(l.campaignId)} target="_blank" rel="noreferrer" className={cn("inline-flex items-center gap-1 font-semibold text-primary hover:underline", TOUCH)}>
                      Open in AdLauncher <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                    {l.designId && (
                      <Link to={links.image({ image: l.designId })} className={cn("inline-flex items-center font-semibold text-primary hover:underline", TOUCH)}>
                        The picture
                      </Link>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-muted-foreground">Spend and leads since each ad was made, as AdLauncher last synced them from Meta.</p>
        </div>
      )}
    </section>
  );
}
