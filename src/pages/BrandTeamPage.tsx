// Brand > Members (/brand/members): who works on the open brand (docs/shared-brands.md). The owner invites, removes and
// revokes here; a member sees whose brand it is and can leave it.
import { useEffect, useState } from "react";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { TeamInvite } from "@/components/TeamInvite";
import { dropSharedBrand } from "@/lib/cloudSync";
import { activeProfile, DEFAULT_PROFILE_ID, setActiveProfile, type Profile } from "@/lib/profiles";
import { brandTeam, leaveBrand } from "@/lib/sharedBrands";
import { supabase } from "@/lib/supabase";

export default function BrandTeamPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [open, setOpen] = useState<Profile | null>(null);
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    document.title = "Members - Postmosis";
    void supabase.auth.getUser().then(async ({ data }) => {
      const id = data.user?.id ?? null;
      setUid(id);
      const p = id ? activeProfile(id) : null;
      setOpen(p);
      if (p?.shared) {
        try {
          setOwner((await brandTeam(p.shared.brand)).find((r) => r.kind === "owner")?.email ?? "");
        } catch (e) {
          setProblem(e instanceof Error ? e.message : "Couldn't load the team.");
        }
      }
    });
  }, []);

  const leave = async () => {
    if (!uid || !open?.shared || !window.confirm(`Leave ${open.name}? Its posts, plan and calendar leave this account.`)) return;
    setBusy(true);
    setProblem("");
    try {
      await leaveBrand(open.shared.brand);
      dropSharedBrand(uid, open.shared.brand);
      setActiveProfile(uid, DEFAULT_PROFILE_ID);
      window.location.assign("/home");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn't leave just now. Try again in a minute.");
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Members</h1>
      {open?.shared ? (
        <div className="space-y-4 rounded-xl border border-border/70 bg-card p-4 sm:p-5">
          <p className="text-sm text-foreground">
            {open.name} belongs to {owner || "its owner"}. You work on its posts, plan and calendar with them.
          </p>
          <Button type="button" variant="outline" className="h-11 sm:h-10" disabled={busy} onClick={() => void leave()}>
            {busy && <CircleNotchIcon className="mr-2 h-4 w-4 animate-spin" />}
            Leave {open.name}
          </Button>
          {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
        </div>
      ) : open ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">People you invite work on {open.name}'s posts, plan and calendar with you.</p>
          <TeamInvite profileId={open.id} brandName={open.name} />
        </div>
      ) : null}
    </div>
  );
}
