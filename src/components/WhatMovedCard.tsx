// What moved this week on Home (find-alerts-digest), Leo only: the Monday email's findings for the open brand, built
// with notify's own code from this device's copy of the synced keys, each with its make-it button. A new set of
// findings shows in the fallback order while Jev picks in the background (week-pick, brief mode); the pick is kept on
// this device and used from the next view, so the list never moves under the reader's finger.
import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { callFn } from "@/lib/edgeFn";
import { activeProfileId, scoped } from "@/lib/profiles";
import { useScrollToHash } from "@/lib/urlState";
import { useLeoUser } from "@/lib/useLeoOnly";
import {
  BRAND_KEYS,
  briefFindings,
  FINDING_ACTION,
  FINDING_LABEL,
  findingLine,
  findingUrl,
  mondayOf,
  pickedFindings,
  profilesFrom,
  sgDay,
  type Finding,
} from "../../supabase/functions/notify/logic.ts";

/** cs-brief-<scope>-<monday> (device): the findings asked about and the ids Jev kept, in order. */
const briefKey = (userId: string, now: number) => `cs-brief-${scoped(userId)}-${mondayOf(sgDay(now))}`;
const asking = new Set<string>();

function keptIds(key: string, asked: string): string[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return v?.asked === asked && Array.isArray(v.ids) ? v.ids : null;
  } catch {
    return null;
  }
}

/** The open brand's profile as notify reads it. */
function openProfile(userId: string) {
  const scope = scoped(userId);
  const data: Record<string, string> = {};
  for (const k of [`content-studio-profiles-${userId}`, ...BRAND_KEYS.map((n) => `content-studio-${n}-${scope}`)]) {
    const v = localStorage.getItem(k);
    if (v !== null) data[k] = v;
  }
  const id = activeProfileId(userId);
  return profilesFrom(userId, data).find((p) => p.id === id) ?? null;
}

export default function WhatMovedCard({ userId }: { userId: string }) {
  const leo = useLeoUser();
  const now = useMemo(() => Date.now(), []);
  const profile = useMemo(() => (leo ? openProfile(userId) : null), [leo, userId]);
  const findings = useMemo<Finding[]>(() => (profile ? briefFindings(profile, now) : []), [profile, now]);
  const key = briefKey(userId, now);
  const asked = findings.map((f) => f.id).join(",");
  const shown = useMemo(() => {
    const ids = keptIds(key, asked);
    return ids ? ids.flatMap((id) => findings.filter((f) => f.id === id)) : pickedFindings(null, findings);
  }, [key, asked, findings]);

  useEffect(() => {
    if (findings.length < 2 || keptIds(key, asked) || asking.has(key + asked)) return;
    asking.add(key + asked);
    const items = findings.map((f) => ({ id: f.id, kind: f.kind, line: findingLine(f) }));
    callFn<{ ids: string[] | null }>("week-pick", { mode: "brief", findings: items, brand: profile?.brand ?? {} })
      .then(({ ids }) => {
        if (ids) localStorage.setItem(key, JSON.stringify({ asked, ids }));
      })
      // the fallback order stays: the card is information, and nothing is lost
      .catch(() => {})
      .finally(() => asking.delete(key + asked));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, asked]);

  useScrollToHash(shown.length >= 2);
  if (!leo || shown.length < 2) return null;
  return (
    <section id="what-moved" className="scroll-mt-20 space-y-3">
      <div className="flex items-center gap-1">
        <h2 className="flex items-center gap-1.5 font-serif text-lg font-semibold text-foreground">
          <TrendingUp className="h-4 w-4 text-primary" /> What moved this week
        </h2>
        <InfoTip label="About what moved">Up to five things from your accounts and the ones you follow, picked each Monday.</InfoTip>
      </div>
      <Card className="border-border/60 shadow-card">
        <CardContent className="divide-y divide-border/60 py-1">
          {shown.map((f) => (
            <div key={f.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3">
              <span className="w-fit shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-center text-[11px] font-semibold text-primary sm:w-20">
                {FINDING_LABEL[f.kind]}
              </span>
              <p className="min-w-0 flex-1 text-sm leading-snug text-foreground">{findingLine(f)}</p>
              <Button asChild variant="outline" size="sm" className="min-h-11 shrink-0 self-start sm:self-auto">
                <Link to={findingUrl(f)}>
                  {FINDING_ACTION[f.kind]} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
