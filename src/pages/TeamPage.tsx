import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Card, CardContent } from "@/components/ui/card";
import LeaderView from "@/components/team/LeaderView";
import MemberView from "@/components/team/MemberView";
import NoTeamView from "@/components/team/NoTeamView";
import { ErrorBlock, LoadingBlock } from "@/components/team/shared";
import { supabase } from "@/lib/supabase";
import { fetchMyTeam, friendlyError, type MyTeam } from "@/lib/teamReview";

type Viewer = { id: string; name: string };

// Team review: leaders approve consultants' posts before they go out and keep
// a record of every decision. Adapts to the viewer: no team, member or leader.
export default function TeamPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const inviteCode = searchParams.get("code") ?? "";
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [myTeam, setMyTeam] = useState<MyTeam | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!data.user) throw new Error("Your session has expired. Sign in again.");
      const meta = data.user.user_metadata ?? {};
      const name =
        typeof meta.full_name === "string"
          ? meta.full_name
          : typeof meta.name === "string"
            ? meta.name
            : "";
      setViewer({ id: data.user.id, name });
      setMyTeam(await fetchMyTeam(data.user.id));
      setStatus("ready");
    } catch (e) {
      setError(friendlyError(e));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const clearInvite = () => {
    if (searchParams.has("code")) setSearchParams({}, { replace: true });
  };

  const handleChanged = () => {
    clearInvite();
    void load();
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          Team review
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Leaders approve posts before they go out. Every submission and decision is kept
          on record.
        </p>
      </header>

      {status === "loading" ? (
        <Card className="border-border/60 shadow-card">
          <CardContent className="p-0 sm:p-0 md:p-0">
            <LoadingBlock label="Loading your team…" />
          </CardContent>
        </Card>
      ) : status === "error" ? (
        <ErrorBlock message={error} onRetry={() => void load()} />
      ) : !viewer || !myTeam ? (
        <NoTeamView
          defaultName={viewer?.name ?? ""}
          initialCode={inviteCode}
          onJoined={handleChanged}
        />
      ) : (
        <>
          {inviteCode && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground"
            >
              <p className="min-w-0 flex-1 break-words">
                You're already in <span className="font-semibold">{myTeam.team.name}</span>, so
                the invite wasn't used. To join another team, leave this one first.
              </p>
              <button
                type="button"
                onClick={clearInvite}
                className="text-xs font-medium text-primary hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}
          {myTeam.me.role === "leader" ? (
            <LeaderView myTeam={myTeam} userId={viewer.id} onLeft={handleChanged} />
          ) : (
            <MemberView myTeam={myTeam} userId={viewer.id} onLeft={handleChanged} />
          )}
        </>
      )}
    </div>
  );
}
