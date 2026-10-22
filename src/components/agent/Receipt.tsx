// What a card did, and how to take it back (docs/north-star/items/agent-approvals.md, "Receipts"): one bordered box
// with the title, the line, one button to the page, and Undo from the stored payload (agentRun's undoReceipt), which
// still works after a reload. A paid make can't be undone, so it says where to delete it instead. After the same
// change on 3 cards, the receipt also asks once whether to keep it (agent-memory's nudge): Remember or No thanks.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAppPath } from "@/components/agent/dockActions";
import { press, undoReceipt } from "@/lib/agentRun";
import type { Nudge } from "@/lib/agentMemory";
import type { Receipt as ReceiptData } from "@/lib/agentCards";

export default function Receipt({ userId, threadId, msgId, receipt, nudge }: { userId: string; threadId: string; msgId: string; receipt: ReceiptData; nudge?: Nudge }) {
  const [busy, setBusy] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const undo = () => {
    setBusy(true);
    undoReceipt(userId, threadId, msgId)
      .then(setSaid, () => setSaid("Couldn't undo that. Try again."))
      .finally(() => setBusy(false));
  };
  const done = !!receipt.undone || said === "Undone.";
  return (
    <section aria-label={receipt.title} className="w-full max-w-xl space-y-2 rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Check className="h-4 w-4 text-success" /> {receipt.title}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted-foreground">{receipt.line}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {receipt.button && isAppPath(receipt.button.path) && (
          <Button asChild variant="outline" size="sm" className="h-11 sm:h-9">
            <Link to={receipt.button.path}>{receipt.button.label}</Link>
          </Button>
        )}
        {receipt.undo &&
          (done ? (
            <span className="text-sm text-muted-foreground">Undone.</span>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={undo} disabled={busy} className="h-11 sm:h-9">
              {busy && <Loader2 className="animate-spin" />} Undo
            </Button>
          ))}
      </div>
      {said && said !== "Undone." && (
        <p className="text-xs text-muted-foreground" role="status">
          {said}
        </p>
      )}
      {receipt.undoText && <p className="text-xs text-muted-foreground">{receipt.undoText}</p>}
      {nudge && (
        <div className="space-y-2 border-t border-border/60 pt-2">
          <p className="text-sm">{nudge.line}</p>
          <div className="flex flex-wrap gap-2">
            {(["remember", "no-thanks"] as const).map((b) => (
              <Button
                key={b}
                type="button"
                size="sm"
                variant={b === "remember" ? "outline" : "ghost"}
                disabled={answered}
                onClick={() => {
                  setAnswered(true);
                  press(userId, threadId, msgId, b).finally(() => setAnswered(false));
                }}
                className="h-11 sm:h-9"
              >
                {b === "remember" ? "Remember" : "No thanks"}
              </Button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
