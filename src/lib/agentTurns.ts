// The agent's running turns and their listeners, apart from the engine (agentRun.ts) so the sidebar's chat list can
// show which chat is working without loading the whole agent (~200 modules).
import type { Turn } from "@/lib/agentRun";

export const turns = new Map<string, Turn>();
const listeners = new Set<() => void>();
export const emitTurns = () => listeners.forEach((l) => l());

export const turnOf = (threadId: string): Turn | null => turns.get(threadId) ?? null;
export function onAgent(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
