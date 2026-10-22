// Dictation through the browser's Web Speech API, the pure half (the hook is src/hooks/useDictation.ts). Idea Dump
// and the interview share it; each passes its own cap to appendDictation.

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type SpeechCtor = new () => SpeechRecognitionLike;

/** The browser's recognizer, the prefixed one where only that exists; null where there is none. */
export function speechRecognition(win: unknown): SpeechCtor | null {
  if (!win) return null;
  const w = win as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** A heard chunk added to the box with one space between, cut at `max` characters. */
export function appendDictation(prev: string, chunk: string, max: number): string {
  const t = chunk.trim();
  if (!t) return prev;
  const sep = !prev.trim() || /\s$/.test(prev) ? "" : " ";
  return `${prev}${sep}${t}`.slice(0, max);
}
