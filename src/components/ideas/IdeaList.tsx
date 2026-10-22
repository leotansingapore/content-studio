// /ideas' list (Leo only): one row per idea with its source chip, title, the angle's first line and, on a written
// idea, Jev's fit. A More like this idea sits right under the one it came from. The page owns the filters and keys.

import { Button } from "@/components/ui/button";
import { SOURCE_CHIP, type IdeasTab, type InboxIdea } from "@/lib/ideasInbox";
import { cn } from "@/lib/utils";

export const chipOf = (i: Pick<InboxIdea, "source" | "like">) => (i.like ? "MORE LIKE THIS" : SOURCE_CHIP[i.source]);
export const fitText = (fit: number | null | undefined) => (typeof fit === "number" ? `fit ${Math.round(fit * 100)}` : "");

export default function IdeaList(p: {
  ideas: InboxIdea[];
  openKey: string | null;
  onOpen: (key: string) => void;
  /** Three skeleton rows in the written ideas' place while a set is being written. */
  writing: boolean;
  tab: IdeasTab;
  empty: string;
  onDiscardAll: () => void;
  /** The account audit's ideas could not be read. */
  postsFailed: boolean;
}) {
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border/60 rounded-xl border border-border/60" aria-label="Ideas">
        {p.writing && [0, 1, 2].map((i) => (
          <li key={`sk${i}`} className="space-y-2 p-3" aria-hidden>
            <span className="block h-3 w-16 animate-pulse rounded bg-muted" />
            <span className="block h-4 w-4/5 animate-pulse rounded bg-muted" />
            <span className="block h-3 w-3/5 animate-pulse rounded bg-muted/70" />
          </li>
        ))}
        {p.ideas.map((i) => {
          const open = i.key === p.openKey;
          return (
            <li key={i.key} className={cn(i.like && "pl-4")}>
              <button
                type="button"
                onClick={() => p.onOpen(i.key)}
                aria-current={open ? "true" : undefined}
                className={cn("block min-h-11 w-full space-y-0.5 p-3 text-left transition-colors hover:bg-muted/40", open && "bg-muted/60")}
              >
                <span className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-muted-foreground">
                  <span className={cn(i.source === "today" && "text-primary")}>{chipOf(i)}</span>
                  {fitText(i.fit) && <span className="ml-auto tabular-nums font-medium">{fitText(i.fit)}</span>}
                </span>
                <span className="block truncate text-sm font-medium">{i.title}</span>
                {i.angle && <span className="block truncate text-xs text-muted-foreground">{i.angle.split("\n")[0]}</span>}
              </button>
            </li>
          );
        })}
        {!p.writing && p.ideas.length === 0 && <li className="p-4 text-sm text-muted-foreground">{p.empty}</li>}
      </ul>
      {p.postsFailed && <p className="text-xs text-muted-foreground">Couldn't load your post ideas.</p>}
      {p.tab === "inbox" && p.ideas.length > 0 && (
        <Button variant="ghost" size="sm" className="text-muted-foreground [@media(pointer:coarse)]:min-h-11" onClick={p.onDiscardAll}>
          Discard all
        </Button>
      )}
    </div>
  );
}
