// The brand's saved audiences above a page's five life-stage chips (brand-audiences, Leo only). Write and Batch mount
// it for Leo's sign-ins only, so everyone else keeps the five chips exactly as they are. With nothing saved, it
// draws the page's chips alone.

import { useEffect, useState, type ReactNode } from "react";
import { type Audience, loadAudiences, onAudiencesChanged } from "@/lib/audiences";

/** The brand's active audiences, main first, kept current as they change; [] without a user. */
export function useSavedAudiences(userId: string | null | undefined): Audience[] {
  const [list, setList] = useState<Audience[]>([]);
  useEffect(() => {
    // an empty list stays the same array, so a sign-in that isn't Leo's draws once
    if (!userId) return setList((l) => (l.length ? [] : l));
    const read = () => setList(loadAudiences(userId));
    read();
    return onAudiencesChanged(read);
  }, [userId]);
  return list;
}

export default function AudiencePicker({ saved, picked, onPick, chip, children }: {
  saved: Audience[];
  picked: string | null;
  onPick: (a: Audience) => void;
  /** The page's own chip classes, on or off. */
  chip: (on: boolean) => string;
  /** The page's life-stage chips. */
  children: ReactNode;
}) {
  if (!saved.length) return <>{children}</>;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Your audiences</p>
      <div className="flex flex-wrap gap-1.5">
        {saved.map((a) => (
          <button key={a.id} type="button" aria-pressed={picked === a.id} title={a.who || undefined} onClick={() => onPick(a)} className={chip(picked === a.id)}>
            {a.name}
          </button>
        ))}
      </div>
      <p className="text-xs font-medium text-muted-foreground">Or a life stage</p>
      {children}
    </div>
  );
}
