import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { friendlyError, leaveTeam } from "@/lib/teamReview";

export default function LeaveTeam({
  teamName,
  note,
  onLeft,
}: {
  teamName: string;
  note: string;
  onLeft: () => void;
}) {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleLeave = async () => {
    setBusy(true);
    setError("");
    try {
      await leaveTeam();
      toast({ title: `You left ${teamName}` });
      onLeft();
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(true)}
        className="gap-1.5 px-2 text-muted-foreground"
      >
        <LogOut className="h-3.5 w-3.5" /> Leave team
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
      <p className="break-words text-sm text-foreground">
        Leave <span className="font-semibold">{teamName}</span>? {note}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="destructive" onClick={handleLeave} disabled={busy} className="gap-1.5">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Leave team
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setConfirming(false);
            setError("");
          }}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
      {error && (
        <p role="alert" className="break-words text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
