import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Shuffle } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { dayMonth, rememberSource, remixedKeys, seedNote, type RemixSource } from "@/lib/remixSource";
import { withParam } from "@/lib/urlState";
import { useLeoUser } from "@/lib/useLeoOnly";
import { cn } from "@/lib/utils";

/**
 * The one Remix button on a card (docs/north-star/items/remix-everywhere.md). Everyone but Leo sees `children`,
 * today's link, unchanged. Leo sees "Remix", which opens the sheet over this page (?remix=<key>, push), and a
 * "Remixed 12 Oct" tag when this brand has remixed it. Imports no data drop: the sheet resolves the key.
 * `className` (width only: flex-1, w-full) and `size` let it keep the slot of the control it replaces.
 */
export default function RemixButton({
  source,
  children,
  className,
  size = "sm",
  label,
  note,
}: {
  source: RemixSource;
  children: ReactNode;
  className?: string;
  size?: ButtonProps["size"];
  /** The card's item, so a screen reader can tell one card's Remix from the next ("Remix: @handle's post"). */
  label?: string;
  /** A suggestion the card shows beside the button, put in the sheet's note when that is empty. */
  note?: string;
}) {
  const leo = useLeoUser();
  const [params, setParams] = useSearchParams();
  const opening = params.get("remix") === source.key;
  // "Opening..." only until the sheet is on screen (its chunk can still be loading on the first press); then "Remix"
  const [up, setUp] = useState(false);
  useEffect(() => {
    if (!opening || !leo) return;
    let frame = 0;
    const check = () => (document.getElementById("remix-title") ? setUp(true) : (frame = requestAnimationFrame(check)));
    frame = requestAnimationFrame(check);
    return () => {
      cancelAnimationFrame(frame);
      setUp(false);
    };
  }, [opening, leo]);
  if (!leo) return <>{children}</>;
  const remixed = remixedKeys(leo.id).get(source.key);
  const open = (e: MouseEvent) => {
    // cards are often links themselves
    e.preventDefault();
    e.stopPropagation();
    // audit: and hubtrend: keys have no data drop: the sheet finds them in this tab's registry
    rememberSource(source, leo.id);
    if (note) seedNote(source.key, note);
    setParams((prev) => withParam(prev, "remix", source.key));
  };
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <Button type="button" variant="outline" size={size} onClick={open} disabled={opening} aria-label={label && `Remix: ${label}`} className={cn("gap-1.5", className)}>
        <Shuffle className="h-3.5 w-3.5" />
        {opening && !up ? "Opening..." : "Remix"}
      </Button>
      {remixed && <span className="whitespace-nowrap text-[11px] text-muted-foreground">Remixed {dayMonth(remixed)}</span>}
    </span>
  );
}
