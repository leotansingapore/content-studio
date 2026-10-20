import type { MouseEvent, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dayMonth, rememberSource, remixedKeys, type RemixSource } from "@/lib/remixSource";
import { withParam } from "@/lib/urlState";
import { useLeoUser } from "@/lib/useLeoOnly";

/**
 * The one Remix button on a card (docs/north-star/items/remix-everywhere.md). Everyone but Leo sees `children`,
 * today's link, unchanged. Leo sees "Remix", which opens the sheet over this page (?remix=<key>, push), and a
 * "Remixed 12 Oct" tag when this brand has remixed it. Imports no data drop: the sheet resolves the key.
 */
export default function RemixButton({ source, children }: { source: RemixSource; children: ReactNode }) {
  const leo = useLeoUser();
  const [params, setParams] = useSearchParams();
  if (!leo) return <>{children}</>;
  const remixed = remixedKeys(leo.id).get(source.key);
  const opening = params.get("remix") === source.key;
  const open = (e: MouseEvent) => {
    // cards are often links themselves
    e.preventDefault();
    e.stopPropagation();
    // audit: and hubtrend: keys have no data drop: the sheet finds them in this tab's registry
    rememberSource(source, leo.id);
    setParams((prev) => withParam(prev, "remix", source.key));
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <Button type="button" variant="outline" size="sm" onClick={open} disabled={opening} className="h-8 gap-1.5 text-xs">
        <Shuffle className="h-3.5 w-3.5" />
        {opening ? "Opening..." : "Remix"}
      </Button>
      {remixed && <span className="text-[11px] text-muted-foreground">Remixed {dayMonth(remixed)}</span>}
    </span>
  );
}
