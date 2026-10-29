import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLeoUser } from "@/lib/useLeoOnly";
import { STUDIO_TOUR, TOUR_STEPS, type TourStep } from "@/lib/tour";
import { adviserBrand } from "@/lib/profession";

export interface TourUser {
  id: string;
  /** The agent's tour on Leo's sign-ins, the studio tour on everyone else's. */
  steps: readonly TourStep[];
  agent: boolean;
}

/** The studio tour for the open brand: Top posts (Singapore finance creators) is a stop on an adviser brand's only. */
export const studioTour = (userId: string): readonly TourStep[] =>
  adviserBrand(userId) ? STUDIO_TOUR : STUDIO_TOUR.filter((s) => s.id !== "swipe");

/** Who a tour is for; null signed out; undefined while the sign-in is still being read. */
export function useTourUser(): TourUser | null | undefined {
  const leo = useLeoUser();
  const [uid, setUid] = useState<string | null>();
  useEffect(() => {
    if (leo !== null) return;
    let live = true;
    // getSession reads the stored session: no Auth round trip under the client lock
    void supabase.auth.getSession().then(({ data }) => live && setUid(data.session?.user.id ?? null));
    return () => {
      live = false;
    };
  }, [leo]);
  // one object per answer, so effects that take it run when the sign-in changes, not on every render
  return useMemo(() => {
    if (leo) return { id: leo.id, steps: TOUR_STEPS, agent: true };
    if (leo === undefined || uid === undefined) return undefined;
    return uid ? { id: uid, steps: studioTour(uid), agent: false } : null;
  }, [leo, uid]);
}
