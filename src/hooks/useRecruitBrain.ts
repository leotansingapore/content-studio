import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { emptyBrain, loadBrain, saveBrain, type RecruitBrain } from "@/lib/recruit";

/**
 * The signed-in user's Brand Brain with autosave: every edit lands in state at
 * once and is written 400ms after the last keystroke, so typed work is never lost
 * to a tab switch. Unmount flushes a pending write.
 */
export function useRecruitBrain() {
  const [userId, setUserId] = useState<string | null>(null);
  const [brain, setBrain] = useState<RecruitBrain>(emptyBrain);
  const [savedAt, setSavedAt] = useState<string>("");
  // Fields render only once the saved doc is in, so nothing typed can be
  // overwritten by a late load.
  const [ready, setReady] = useState(false);
  const pending = useRef<RecruitBrain | null>(null);
  const timer = useRef<number>();
  const idRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const id = data.user?.id ?? null;
      idRef.current = id;
      setUserId(id);
      const b = loadBrain(id);
      setBrain(b);
      setSavedAt(b.updatedAt);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    if (pending.current && idRef.current) {
      setSavedAt(saveBrain(idRef.current, pending.current).updatedAt);
      pending.current = null;
    }
  }, []);

  // Unmount, or the tab closing inside the debounce window, still saves.
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  const update = useCallback(
    (fn: (b: RecruitBrain) => RecruitBrain) => {
      setBrain((prev) => {
        const next = fn(prev);
        pending.current = next;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(flush, 400);
        return next;
      });
    },
    [flush],
  );

  return { userId, brain, update, savedAt, ready };
}
