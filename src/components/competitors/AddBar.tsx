// The add bar on /competitors: a link or @handle is added at once with no server call; a site or a bare name adds
// the row at once ("Finding them...") and reads it in a job outside React. Only a bare name pays a provider, so
// only a name shows the price chip.
import { useState } from "react";
import { Plus } from "lucide-react";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import { MAX_COMPETITORS, addCompetitor, parseInput, runRead } from "@/lib/competitors";

export default function AddBar({ userId, count, busy, onAdded }: { userId: string; count: number; /** a read is running: today's uses are read again when it ends */ busy: boolean; onAdded?: (id: string, needsName: boolean) => void }) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const parsed = parseInput(text);
  const full = count >= MAX_COMPETITORS;
  const left = useUsesLeft(busy)("competitor-read");

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (full || !text.trim()) return;
    if (!parsed) return toast({ title: "Type a name, a website or a social link." });
    const r = addCompetitor(userId, {
      name: parsed.kind === "site" ? parsed.site : parsed.name,
      site: parsed.kind === "site" ? parsed.site : null,
      logo: null,
      why: "",
      fbPageId: parsed.kind === "link" ? parsed.fbPageId : null,
      handles: parsed.kind === "link" ? parsed.handles : {},
      adsCountry: "SG",
      source: "typed",
    });
    if ("reason" in r) return toast({ title: r.reason === "duplicate" ? `You already watch ${r.existing?.name ?? "them"}.` : `${MAX_COMPETITORS} of ${MAX_COMPETITORS}. Remove one to add another.` });
    setText("");
    if (parsed.kind !== "link") void runRead(userId, r.c.id, parsed.kind === "site" ? parsed.site : parsed.name);
    onAdded?.(r.c.id, parsed.kind === "link" && !parsed.named);
  };

  return (
    <form onSubmit={add} className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Plus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a competitor: a name, a website or a social link"
            aria-label="Add a competitor"
            className="h-11 pl-9 sm:h-10"
            disabled={full}
          />
        </div>
        <Button type="submit" className="h-11 shrink-0 sm:h-10" disabled={full || !text.trim()}>Add</Button>
        <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">{count} of {MAX_COMPETITORS}</span>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {full ? (
          <span className="font-medium text-foreground">{MAX_COMPETITORS} of {MAX_COMPETITORS}. Remove one to add another.</span>
        ) : (
          <span className="tabular-nums sm:hidden">{count} of {MAX_COMPETITORS}</span>
        )}
        {!full && parsed?.kind === "name" && <PriceChip feature="competitor-read" left={left} />}
      </p>
    </form>
  );
}
