// The film's soundtrack, rendered off the main thread:
//   const w = new Worker(new URL("./film/sound.worker.ts", import.meta.url), { type: "module" });
//   w.postMessage({ id, film, opts });  // opts: SoundOptions
//   w.onmessage = (e) => e.data  // { id, key, L, R, lufs, peak, style } with L and R transferred, or { id, error }
// The last few renders are kept by soundKey, so an edit that leaves the timing alone answers at once.
import { renderFilmSound, soundKey, type FilmSound, type SoundOptions } from "./sound.ts";
import type { Film } from "./timeline.ts";

const scope = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage: (m: unknown, transfer: Transferable[]) => void };
const cache = new Map<string, FilmSound>();
const KEEP = 4;

scope.onmessage = (e: MessageEvent<{ id: string; film: Film; opts?: SoundOptions }>) => {
  const { id, film, opts } = e.data ?? ({} as never);
  try {
    const key = soundKey(film, opts);
    let s = cache.get(key);
    if (!s) {
      s = renderFilmSound(film, opts);
      cache.set(key, s);
      if (cache.size > KEEP) cache.delete(cache.keys().next().value);
    }
    // copies go out, so the cached buffers stay whole
    const L = s.L.slice(), R = s.R.slice();
    scope.postMessage({ id, key, L, R, lufs: s.lufs, peak: s.peak, style: s.style }, [L.buffer, R.buffer]);
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) }, []);
  }
};
