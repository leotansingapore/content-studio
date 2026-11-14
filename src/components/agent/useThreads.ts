// The account's agent chats, redrawn as they change or a turn moves: in its own file so the sidebar's chat list
// doesn't load the whole agent with it.
import { useEffect, useReducer } from "react";
import { onAgent } from "@/lib/agentTurns";
import { loadThreads, onThreadsChanged } from "@/lib/agentThreads";

export function useThreads(userId: string) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const a = onThreadsChanged(redraw);
    const b = onAgent(redraw);
    return () => {
      a();
      b();
    };
  }, []);
  return loadThreads(userId);
}
