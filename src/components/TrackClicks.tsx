// "Track clicks" beside a link (Brand kit offers, Link in bio): makes a
// tracked /t/ link for that address and offers to put it in the link's place.
// Members only (019); shows nothing for anyone else, or for an address that
// is not a web link or is already one of ours.
import { useEffect, useState } from "react";
import { BarChart3, Loader2, Repeat } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { isValidLinkUrl, withScheme } from "@/lib/bioPage";
import { MAX_LABEL, canTrack, isTrackedUrl, saveTrackedLink, trackedUrl } from "@/lib/trackedLinks";

const SIZE = "h-9 gap-1.5 px-2 text-xs [@media(pointer:coarse)]:h-11";

export default function TrackClicks({ url, label, onUse }: { url: string; label: string; onUse: (tracked: string) => void }) {
  const { toast } = useToast();
  const [member, setMember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ from: string; slug: string } | null>(null);
  const target = withScheme(url.trim());

  useEffect(() => {
    let on = true;
    void canTrack().then((ok) => on && setMember(ok));
    return () => {
      on = false;
    };
  }, []);

  const ours = isTrackedUrl(target) || target.startsWith(trackedUrl(window.location.origin, ""));
  if (!member || !isValidLinkUrl(target) || ours) return null;

  if (made?.from === target) {
    return (
      <Button size="sm" variant="ghost" onClick={() => onUse(trackedUrl(window.location.origin, made.slug))} className={`${SIZE} text-primary`}>
        <Repeat className="h-3.5 w-3.5" /> Swap in /t/{made.slug}
      </Button>
    );
  }

  const make = async () => {
    setBusy(true);
    try {
      const row = await saveTrackedLink(null, { slug: "", label: label.trim().slice(0, MAX_LABEL) || new URL(target).host, url: target, campaign: "" });
      setMade({ from: target, slug: row.slug });
      toast({ title: "Tracked link made", description: trackedUrl(window.location.origin, row.slug) });
    } catch (e) {
      toast({ title: "Couldn't make a tracked link", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void make()} className={`${SIZE} text-muted-foreground`}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />} Track clicks
    </Button>
  );
}
