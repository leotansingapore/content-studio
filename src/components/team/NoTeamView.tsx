import { useState, type FormEvent } from "react";
import { KeyRound, Loader2, ShieldCheck, Users } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  createTeam,
  formatInviteCode,
  friendlyError,
  isWellFormedInviteCode,
  joinTeam,
} from "@/lib/teamReview";

export default function NoTeamView({
  defaultName,
  initialCode,
  onJoined,
}: {
  defaultName: string;
  initialCode: string;
  onJoined: () => void;
}) {
  const { toast } = useToast();

  const [teamName, setTeamName] = useState("");
  const [leaderName, setLeaderName] = useState(defaultName);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [code, setCode] = useState(initialCode ? formatInviteCode(initialCode) : "");
  const [memberName, setMemberName] = useState(defaultName);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  const invited = Boolean(initialCode);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) {
      setCreateError("Give your team a name.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      await createTeam(teamName.trim(), leaderName.trim());
      toast({
        title: "Team created",
        description: "Share the invite code with your consultants.",
      });
      onJoined();
    } catch (err) {
      setCreateError(friendlyError(err));
      setCreating(false);
    }
  };

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    if (!isWellFormedInviteCode(code)) {
      setJoinError(
        "Invite codes have 10 letters and numbers, like ABCDE-FGH23. They never use 0, O, 1 or I.",
      );
      return;
    }
    setJoining(true);
    setJoinError("");
    try {
      const { teamName: joined } = await joinTeam(code, memberName.trim());
      toast({
        title: `You joined ${joined}`,
        description: "Submit drafts for review from My posts.",
      });
      onJoined();
    } catch (err) {
      setJoinError(friendlyError(err));
      setJoining(false);
    }
  };

  const joinCard = (
    <Card
      className={`border-border/60 shadow-card ${invited ? "ring-2 ring-primary/40" : ""}`}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-serif text-xl">
          <KeyRound className="h-5 w-5 shrink-0 text-primary" /> Join with a code
        </CardTitle>
        <CardDescription>
          {invited
            ? "You've been invited to a team. Check the code, add your name and join."
            : "For consultants. Your leader reviews the posts you submit before you publish them."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleJoin} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="team-invite-code">Invite code</Label>
            <Input
              id="team-invite-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABCDE-FGH23"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={16}
              className="font-mono uppercase tracking-[0.2em]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-member-name">Your name, as your team sees it</Label>
            <Input
              id="team-member-name"
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              placeholder="e.g. Mei Lin Tan"
              maxLength={80}
              autoComplete="name"
            />
          </div>
          {joinError && (
            <p role="alert" className="break-words text-sm text-destructive">
              {joinError}
            </p>
          )}
          <Button type="submit" disabled={joining} className="w-full gap-1.5 sm:w-auto">
            {joining && <Loader2 className="h-4 w-4 animate-spin" />} Join team
          </Button>
        </form>
      </CardContent>
    </Card>
  );

  const createCard = (
    <Card className="border-border/60 shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-serif text-xl">
          <Users className="h-5 w-5 shrink-0 text-primary" /> Create a team
        </CardTitle>
        <CardDescription>
          For agency leaders. You get an invite code for your consultants and a queue of
          posts to approve.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCreate} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Team name</Label>
            <Input
              id="team-name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. Lee & Partners Advisory"
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-leader-name">Your name, as your team sees it</Label>
            <Input
              id="team-leader-name"
              value={leaderName}
              onChange={(e) => setLeaderName(e.target.value)}
              placeholder="e.g. Daniel Lee"
              maxLength={80}
              autoComplete="name"
            />
          </div>
          {createError && (
            <p role="alert" className="break-words text-sm text-destructive">
              {createError}
            </p>
          )}
          <Button type="submit" disabled={creating} className="w-full gap-1.5 sm:w-auto">
            {creating && <Loader2 className="h-4 w-4 animate-spin" />} Create team
          </Button>
        </form>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {invited ? (
          <>
            {joinCard}
            {createCard}
          </>
        ) : (
          <>
            {createCard}
            {joinCard}
          </>
        )}
      </div>
      <Card className="border-border/60 bg-muted/20">
        <CardContent className="flex gap-3 p-4 text-sm text-muted-foreground sm:p-4 md:p-4">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <ol className="list-decimal space-y-1 pl-4">
            <li>A consultant submits a draft from My posts. The text and its compliance flags are saved as they were.</li>
            <li>The leader approves it or asks for changes, with a comment.</li>
            <li>Every step is kept in an audit trail the leader can export.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
