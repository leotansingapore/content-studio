// A board post or team message the feedback service offered (an "fb:" chip under an agent message). Its words may come
// from anything the service read, so the first press only shows them exactly, and where they go; only Post sends them.
// The person's name and email ride with the post but are never shown here.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { runAction, type DockIdentity, type FbAction } from "@/components/agent/dockActions";

export default function FbChip({ a, label, identity, disabled, onDone }: { a: FbAction; label: string; identity?: DockIdentity; disabled?: boolean; onDone: (line: string) => void }) {
  const [step, setStep] = useState<"chip" | "ask" | "posting">("chip");
  if (step === "chip")
    return (
      <Button type="button" size="sm" variant="outline" className="h-11 sm:h-9" disabled={disabled} onClick={() => setStep("ask")}>
        {label}
      </Button>
    );
  const board = a.type === "feedback";
  const words = board ? a.body : a.message;
  const post = async () => {
    setStep("posting");
    const line = await runAction(a, { identity });
    if (line) onDone(line);
  };
  return (
    <div role="group" aria-label={label} className="basis-full space-y-2 rounded-xl border border-border bg-muted/40 p-3 text-sm">
      <p className="text-xs text-muted-foreground">{board ? "This posts on the public feedback board, under your name:" : "This goes to the team, and the reply comes to your email:"}</p>
      {board && <p className="break-words font-semibold">{a.title}</p>}
      {words && <p className="whitespace-pre-wrap break-words">{words}</p>}
      <div className="flex gap-1.5">
        <Button type="button" size="sm" className="h-11 sm:h-9" disabled={step === "posting"} onClick={() => void post()}>
          {step === "posting" ? "Posting..." : "Post"}
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-11 sm:h-9" disabled={step === "posting"} onClick={() => setStep("chip")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
