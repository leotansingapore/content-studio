// /design/campaigns: slideshow campaigns, post formulas that make a new TikTok slideshow on a schedule and send it to
// the account's TikTok drafts (Volume's campaigns, folded in 31 Oct). Rows are read straight from the tables
// (owner-only select); every change goes through the slide-campaigns function.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { callFn } from "@/lib/edgeFn";
import { activeProfileId } from "@/lib/profiles";
import { socialConnectShown } from "@/lib/socialConnect";
import { supabase } from "@/lib/supabase";
import { useSignedInUser } from "@/lib/useLeoOnly";
import { postsPerWeek, sanitizeSchedule } from "../../supabase/functions/_shared/slideCampaign.ts";

export interface CampaignRowView {
  id: string;
  name: string;
  status: "draft" | "live" | "paused";
  spec: unknown;
  schedule: unknown;
  publish: unknown;
  account_id: string | null;
  account_name: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  last_error: string | null;
  profile_id: string;
  updated_at: string;
}

export const STATUS_LABEL = { draft: "Draft", live: "Live", paused: "Paused" } as const;
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Every day at 9:00 AM", "Mon, Wed at 6:00 PM", or "3 times a day, 21 a week". */
export function cadence(raw: unknown): string {
  const s = sanitizeSchedule(raw);
  if (!s.times.length) return "No posting times";
  const t12 = (at: string) => new Date(`2000-01-01T${at}:00`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (s.times.length === 1) {
    const t = s.times[0];
    return `${t.days.length === 7 ? "Every day" : t.days.map((d) => DAY[d]).join(", ")} at ${t12(t.at)}`;
  }
  return `${s.times.length} times a day, ${postsPerWeek(s)} a week`;
}
export const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function SlideCampaignsPage() {
  const user = useSignedInUser();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<CampaignRowView[] | null>(null);
  const [making, setMaking] = useState(false);
  const profile = activeProfileId(user?.id);
  const canPost = socialConnectShown();

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("cs_slide_campaigns")
      .select("*")
      .eq("profile_id", profile)
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => setRows(error ? [] : ((data ?? []) as CampaignRowView[])));
  }, [user, profile]);

  const create = async () => {
    setMaking(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Singapore";
      const r = await callFn<{ campaign: CampaignRowView }>("slide-campaigns", {
        action: "save",
        campaign: { profile_id: profile, name: "Untitled campaign", spec: {}, schedule: { tz, times: [{ at: "09:00", days: [0, 1, 2, 3, 4, 5, 6] }] } },
      });
      navigate(`/design/campaigns/${r.campaign.id}`);
    } catch (e) {
      toast({ title: "Couldn't make the campaign", description: (e as Error).message, variant: "destructive" });
      setMaking(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Campaigns</h1>
          {rows && <p className="text-sm text-muted-foreground">{`${rows.length} campaign${rows.length === 1 ? "" : "s"}, ${rows.filter((r) => r.status === "live").length} live`}</p>}
        </div>
        <Button onClick={() => void create()} disabled={making || !canPost} className="gap-1.5">
          {making ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} New campaign
        </Button>
      </header>
      {!canPost && <p className="text-sm text-muted-foreground">Campaigns send posts to your TikTok drafts, so they need posting switched on for your account. It's set up at your walkthrough.</p>}
      {!rows && <p className="text-sm text-muted-foreground">Loading your campaigns</p>}
      {rows?.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-medium">No campaigns yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Make one example post; the campaign makes a new one on your schedule and sends it to your TikTok drafts.</p>
        </div>
      )}
      <ul className="space-y-2">
        {rows?.map((r) => (
          <li key={r.id}>
            <Link to={`/design/campaigns/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border px-4 py-3 hover:border-primary">
              <span className="font-medium">{r.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${r.status === "live" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>{STATUS_LABEL[r.status]}</span>
              <span className="text-sm text-muted-foreground">
                {cadence(r.schedule)}
                {r.account_name ? `, @${r.account_name}` : ""}
                {r.status === "live" && r.next_run_at ? `, next ${when(r.next_run_at)}` : r.last_run_at ? `, last ${when(r.last_run_at)}` : ", no posts yet"}
              </span>
              {r.last_error && <span className="w-full text-xs text-destructive">{r.last_error}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
