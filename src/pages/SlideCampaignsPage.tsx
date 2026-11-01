// /design/campaigns: slideshow campaigns, post formulas that make a new TikTok slideshow on a schedule and send it to
// the account's TikTok drafts or profile (Volume's campaigns, folded in 31 Oct). Rows are read straight from the tables
// (owner-only select); every change goes through the slide-campaigns function.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Images, Loader2, Plus } from "lucide-react";
import { Segmented } from "@/components/design/fields";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import { callFn } from "@/lib/edgeFn";
import { activeProfileId } from "@/lib/profiles";
import { socialConnectShown } from "@/lib/socialConnect";
import { supabase } from "@/lib/supabase";
import { useUrlState } from "@/lib/urlState";
import { useSignedInUser } from "@/lib/useLeoOnly";
import { cadence, STATUS_LABEL, when } from "@/lib/campaignLabels";
import { DAILY_LIMITS } from "../../supabase/functions/_shared/usageCaps.ts";

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

export { STATUS_LABEL, cadence, when } from "@/lib/campaignLabels";

export default function SlideCampaignsPage() {
  const user = useSignedInUser();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<CampaignRowView[] | null>(null);
  const [making, setMaking] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const [show, setShow] = useUrlState("show", "all", { allowed: ["all", "live"] });
  const left = useUsesLeft(making);
  const profile = activeProfileId(user?.id);
  const canPost = socialConnectShown();

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("cs_slide_campaigns")
      .select("*")
      .eq("profile_id", profile)
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        const list = error ? [] : ((data ?? []) as CampaignRowView[]);
        setRows(list);
        if (list.length)
          void callFn<{ thumbs: Record<string, string | null> }>("slide-campaigns", { action: "thumbs", ids: list.map((r) => r.id) })
            .then((r) => setThumbs(r.thumbs))
            .catch(() => undefined);
      });
  }, [user, profile]);
  const shown = rows?.filter((r) => show === "all" || r.status === "live");
  const meter = (
    [
      ["slide-campaign-post", "posts"],
      ["slide-campaign-make", "examples"],
      ["ai-image", "AI pictures"],
    ] as const
  )
    .map(([f, label]) => {
      const n = left(f);
      return n === null ? null : `${DAILY_LIMITS[f] - n} of ${DAILY_LIMITS[f]} ${label}`;
    })
    .filter(Boolean)
    .join(", ");

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
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild className="gap-1.5">
            <Link to="/design/libraries">
              <Images className="h-4 w-4" /> Libraries
            </Link>
          </Button>
          <Button onClick={() => void create()} disabled={making || !canPost} className="gap-1.5">
            {making ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} New campaign
          </Button>
        </div>
      </header>
      {canPost && meter && <p className="text-xs text-muted-foreground">Used today: {meter}</p>}
      {!!rows?.length && <Segmented value={show} options={[{ value: "all", label: "All" }, { value: "live", label: "Live" }] as const} onChange={setShow} />}
      {!canPost && <p className="text-sm text-muted-foreground">Campaigns post to your TikTok, so they need posting switched on for your account. It's set up at your walkthrough.</p>}
      {!rows && <p className="text-sm text-muted-foreground">Loading your campaigns</p>}
      {rows?.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-medium">No campaigns yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Make one example post; the campaign makes a new one on your schedule and sends it to TikTok.</p>
        </div>
      )}
      {shown?.length === 0 && !!rows?.length && <p className="text-sm text-muted-foreground">None live.</p>}
      <ul className="space-y-2">
        {shown?.map((r) => (
          <li key={r.id}>
            <Link to={`/design/campaigns/${r.id}`} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 hover:border-primary">
              {thumbs[r.id] ? <img src={thumbs[r.id]!} alt="" loading="lazy" className="h-16 w-9 shrink-0 rounded object-cover" /> : <span className="h-16 w-9 shrink-0 rounded bg-muted" />}
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium">{r.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${r.status === "live" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>{STATUS_LABEL[r.status]}</span>
              <span className="text-sm text-muted-foreground">
                {cadence(r.schedule)}
                {r.account_name ? `, @${r.account_name}` : ""}
                {r.status === "live" && r.next_run_at ? `, next ${when(r.next_run_at)}` : r.last_run_at ? `, last ${when(r.last_run_at)}` : ", no posts yet"}
              </span>
              {r.last_error && <span className="w-full text-xs text-destructive">{r.last_error}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
