import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, UserPlus } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import AuditTrail from "@/components/team/AuditTrail";
import LeaveTeam from "@/components/team/LeaveTeam";
import ReviewQueue from "@/components/team/ReviewQueue";
import { ErrorBlock, LoadingBlock, formatWhen } from "@/components/team/shared";
import {
  fetchApprovalRules,
  fetchRoster,
  formatInviteCode,
  friendlyError,
  inviteLink,
  setApprovalRequired,
  type MyTeam,
  type TeamMember,
} from "@/lib/teamReview";

export default function LeaderView({
  myTeam,
  userId,
  onLeft,
}: {
  myTeam: MyTeam;
  userId: string;
  onLeft: () => void;
}) {
  const [auditKey, setAuditKey] = useState(0);
  return (
    <div className="space-y-6">
      <TeamCard myTeam={myTeam} userId={userId} onLeft={onLeft} onRuleChanged={() => setAuditKey((k) => k + 1)} />
      <ReviewQueue
        teamId={myTeam.team.id}
        userId={userId}
        onReviewed={() => setAuditKey((k) => k + 1)}
      />
      <AuditTrail team={myTeam.team} refreshKey={auditKey} />
    </div>
  );
}

function RoleBadge({ role }: { role: TeamMember["role"] }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
        role === "leader"
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/60 bg-muted/40 text-muted-foreground"
      }`}
    >
      {role === "leader" ? "Leader" : "Member"}
    </span>
  );
}

// The team rule "needs approval before posting": a checkbox per member. Never
// on a leader or the team's owner (the server refuses those too).
function RuleToggle({
  member,
  on,
  busy,
  onChange,
}: {
  member: TeamMember;
  on: boolean;
  busy: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-xs text-foreground">
      <input
        type="checkbox"
        checked={on}
        disabled={busy}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={`${member.display_name} needs approval before posting`}
        className="h-4 w-4"
      />
      Needs approval before posting
    </label>
  );
}

function TeamCard({
  myTeam,
  userId,
  onLeft,
  onRuleChanged,
}: {
  myTeam: MyTeam;
  userId: string;
  onLeft: () => void;
  onRuleChanged: () => void;
}) {
  const { toast } = useToast();
  const { team, inviteCode } = myTeam;
  const [roster, setRoster] = useState<TeamMember[]>([]);
  const [rules, setRules] = useState<Set<string>>(new Set());
  const [ruleBusy, setRuleBusy] = useState<string | null>(null);
  const canHaveRule = (m: TeamMember) => m.role === "member" && m.user_id !== team.owner_id && m.user_id !== userId;

  const toggleRule = async (m: TeamMember, on: boolean) => {
    setRuleBusy(m.user_id);
    setRules((prev) => {
      const next = new Set(prev);
      if (on) next.add(m.user_id);
      else next.delete(m.user_id);
      return next;
    });
    try {
      await setApprovalRequired(m.user_id, on);
      toast({
        title: on ? "Team rule on" : "Team rule off",
        description: on
          ? `${m.display_name}'s posts now show as locked until you approve them.`
          : `${m.display_name} no longer needs approval before posting.`,
      });
      onRuleChanged();
    } catch (e) {
      setRules((prev) => {
        const next = new Set(prev);
        if (on) next.delete(m.user_id);
        else next.add(m.user_id);
        return next;
      });
      toast({ title: "Couldn't change the rule", description: friendlyError(e), variant: "destructive" });
    } finally {
      setRuleBusy(null);
    }
  };
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const [people, ruleSet] = await Promise.all([
        fetchRoster(team.id),
        fetchApprovalRules(team.id).catch(() => new Set<string>()),
      ]);
      setRoster(people);
      setRules(ruleSet);
      setStatus("ready");
    } catch (e) {
      setError(friendlyError(e));
      setStatus("error");
    }
  }, [team.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (text: string, title: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title, description: text });
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the code and copy it yourself.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          You lead
        </p>
        <CardTitle className="break-words font-serif text-xl">{team.name}</CardTitle>
        <CardDescription>
          Created {formatWhen(team.created_at)}
          {status === "ready" ? ` · ${roster.length} ${roster.length === 1 ? "person" : "people"}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 sm:p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <UserPlus className="h-3.5 w-3.5 text-primary" /> Invite consultants
          </p>
          {inviteCode ? (
            <>
              <p
                className="mt-2 break-all font-mono text-2xl font-semibold tracking-[0.18em] text-foreground"
                aria-label={`Invite code ${inviteCode.split("").join(" ")}`}
              >
                {formatInviteCode(inviteCode)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Anyone with this code can join your team and submit posts to you.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copy(formatInviteCode(inviteCode), "Invite code copied")}
                  className="gap-1.5"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy code
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copy(inviteLink(window.location.origin, inviteCode), "Invite link copied")}
                  className="gap-1.5"
                >
                  <Link2 className="h-3.5 w-3.5" /> Copy invite link
                </Button>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No invite code found for this team.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Roster</h2>
          {status === "loading" ? (
            <LoadingBlock label="Loading the roster…" />
          ) : status === "error" ? (
            <ErrorBlock message={error} onRetry={() => void load()} />
          ) : (
            <>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      <th scope="col" className="py-2 pr-3 font-semibold">Name</th>
                      <th scope="col" className="py-2 pr-3 font-semibold">Role</th>
                      <th scope="col" className="py-2 pr-3 font-semibold">Joined</th>
                      <th scope="col" className="py-2 font-semibold">
                        <span className="inline-flex items-center gap-1">
                          Team rule
                          <InfoTip label="About the team rule">
                            A reminder in the app: their posts stay locked until you approve them.
                          </InfoTip>
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((m) => (
                      <tr key={m.user_id} className="border-b border-border/40 last:border-0">
                        <td className="break-words py-2 pr-3 font-medium text-foreground">
                          {m.display_name}
                          {m.user_id === userId && (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <RoleBadge role={m.role} />
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">
                          {formatWhen(m.joined_at)}
                        </td>
                        <td className="py-1">
                          {canHaveRule(m) ? (
                            <RuleToggle
                              member={m}
                              on={rules.has(m.user_id)}
                              busy={ruleBusy === m.user_id}
                              onChange={(on) => void toggleRule(m, on)}
                            />
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-2 sm:hidden">
                {roster.map((m) => (
                  <li key={m.user_id} className="rounded-lg border border-border/60 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {m.display_name}
                          {m.user_id === userId && (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>
                          )}
                        </p>
                        <p className="text-[11px] text-muted-foreground">Joined {formatWhen(m.joined_at)}</p>
                      </div>
                      <RoleBadge role={m.role} />
                    </div>
                    {canHaveRule(m) && (
                      <RuleToggle
                        member={m}
                        on={rules.has(m.user_id)}
                        busy={ruleBusy === m.user_id}
                        onChange={(on) => void toggleRule(m, on)}
                      />
                    )}
                  </li>
                ))}
              </ul>
              {roster.length <= 1 && (
                <p className="text-xs text-muted-foreground">
                  Nobody has joined yet. Send your consultants the code or the invite link.
                </p>
              )}
            </>
          )}
        </div>

        <LeaveTeam
          teamName={team.name}
          note="A leader can only leave while nobody else is in the team and nothing has been submitted."
          onLeft={onLeft}
        />
      </CardContent>
    </Card>
  );
}
