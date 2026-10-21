// Undo and redo on the carousel maker (edit-carousel, Leo only): every slide change is one step, typing one step per
// pause of 800 ms (or a move to another field), 20 steps kept, in memory. Pure, so carouselHistory.test.ts covers it.

export const HISTORY_STEPS = 20;
export const TYPING_PAUSE_MS = 800;

export interface History<T> {
  past: T[];
  future: T[];
}

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [] });

/** `before` becomes the step Undo goes back to; Redo is dropped, as after any new change. */
export function record<T>(h: History<T>, before: T): History<T> {
  return { past: [...h.past, before].slice(-HISTORY_STEPS), future: [] };
}

/** The state to go back to from `now`, or null at the start of history. */
export function undo<T>(h: History<T>, now: T): { h: History<T>; to: T } | null {
  if (!h.past.length) return null;
  return { h: { past: h.past.slice(0, -1), future: [now, ...h.future] }, to: h.past[h.past.length - 1] };
}

/** The state Undo left, or null at the end of history. */
export function redo<T>(h: History<T>, now: T): { h: History<T>; to: T } | null {
  if (!h.future.length) return null;
  return { h: { past: [...h.past, now].slice(-HISTORY_STEPS), future: h.future.slice(1) }, to: h.future[0] };
}

/** Typing is a new step after a pause of 800 ms, or in another field; otherwise it joins the step it is in. */
export const newTypingStep = (last: { at: number; field: string } | null, at: number, field: string): boolean =>
  !last || last.field !== field || at - last.at >= TYPING_PAUSE_MS;
